/**
 * Claude Messages API via Cloudflare AI Gateway REST API or direct Anthropic.
 * Set CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID (preferred), or ANTHROPIC_API_KEY (legacy).
 */
import { anthropicProxyErrorMessage, fetchAnthropicWithRetry } from "./anthropic-upstream.mjs";

/** @typedef {"cloudflare" | "anthropic"} ClaudeProvider */

/** Maps app model ids to Cloudflare AI Gateway REST model names. */
const CLOUDFLARE_MODEL_ALIASES = {
  "claude-haiku-4-5-20251001": "anthropic/claude-haiku-4-5",
  "claude-sonnet-4-6": "anthropic/claude-sonnet-4-6",
};

export const mapModelForCloudflare = model => {
  const id = String(model || "").trim();
  if (!id) return id;
  if (id.startsWith("anthropic/") || id.startsWith("@cf/")) return id;
  if (CLOUDFLARE_MODEL_ALIASES[id]) return CLOUDFLARE_MODEL_ALIASES[id];
  if (id.startsWith("claude-")) return `anthropic/${id}`;
  return id;
};

/**
 * @param {Record<string, string | undefined>} source
 * @returns {{ provider: ClaudeProvider, token: string, accountId?: string, gatewayId?: string, messagesUrl: string } | null}
 */
export const resolveClaudeCredentials = (source = process.env) => {
  const cfToken = (source.CLOUDFLARE_API_TOKEN || "").trim();
  const accountId = (source.CLOUDFLARE_ACCOUNT_ID || "").trim();
  const gatewayId = (source.CLOUDFLARE_AI_GATEWAY_ID || "").trim();

  if (cfToken && accountId) {
    return {
      provider: "cloudflare",
      token: cfToken,
      accountId,
      gatewayId: gatewayId || undefined,
      messagesUrl: `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/messages`,
    };
  }

  const anthropicKey = (source.ANTHROPIC_API_KEY || "").trim();
  if (anthropicKey) {
    return {
      provider: "anthropic",
      token: anthropicKey,
      messagesUrl: "https://api.anthropic.com/v1/messages",
    };
  }

  return null;
};

export const claudeCredentialsMissingMessage = () =>
  "Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in .env.local (or Vercel env), " +
  "or set ANTHROPIC_API_KEY for direct Anthropic access.";

/**
 * @param {string} bodyString
 * @param {{ provider: ClaudeProvider }} creds
 */
export const prepareClaudeMessagesBody = (bodyString, creds) => {
  if (creds.provider !== "cloudflare") return bodyString;
  try {
    const payload = JSON.parse(bodyString);
    if (payload.model) payload.model = mapModelForCloudflare(payload.model);
    return JSON.stringify(payload);
  } catch {
    return bodyString;
  }
};

/** @param {{ provider: ClaudeProvider, token: string, gatewayId?: string }} creds */
export const buildClaudeRequestHeaders = creds => {
  if (creds.provider === "cloudflare") {
    return {
      "content-type": "application/json",
      Authorization: `Bearer ${creds.token}`,
      ...(creds.gatewayId ? { "cf-aig-gateway-id": creds.gatewayId } : {}),
    };
  }
  return {
    "content-type": "application/json",
    "x-api-key": creds.token,
    "anthropic-version": "2023-06-01",
  };
};

export function claudeProxyErrorMessage(err, creds) {
  const base = anthropicProxyErrorMessage(err);
  if (!creds) return base;
  if (creds.provider === "cloudflare") {
    return base.replace(/api\.anthropic\.com/g, "api.cloudflare.com");
  }
  return base;
}

/**
 * Forward a Messages API request body to Cloudflare or Anthropic.
 * @param {string} bodyString
 * @param {Record<string, string | undefined>} [env]
 * @param {number} [attempts]
 */
export async function proxyClaudeMessages(bodyString, env = process.env, attempts = 3) {
  const creds = resolveClaudeCredentials(env);
  if (!creds) {
    throw new Error(claudeCredentialsMissingMessage());
  }

  const body = prepareClaudeMessagesBody(bodyString, creds);
  const headers = buildClaudeRequestHeaders(creds);

  return fetchAnthropicWithRetry(
    creds.messagesUrl,
    { method: "POST", headers, body },
    attempts
  );
}
