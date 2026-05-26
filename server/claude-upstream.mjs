/**
 * Messages API via Cloudflare Workers AI (@cf/*), Cloudflare AI Gateway (Claude), or Anthropic.
 * Set CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_MODEL (@cf/...) for Workers AI.
 * Or omit CLOUDFLARE_MODEL (or use anthropic/claude-* ids) for Claude via gateway.
 * Legacy: ANTHROPIC_API_KEY for direct Anthropic.
 */
import { anthropicProxyErrorMessage, fetchAnthropicWithRetry } from "./anthropic-upstream.mjs";

/** @typedef {"cloudflare-gateway" | "cloudflare-rest" | "cloudflare-workers-chat" | "anthropic"} ClaudeProvider */

export const DEFAULT_CLOUDFLARE_GATEWAY_ID = "default";

/** Normalize Workers AI ids — Vercel and some hosts strip a leading `@` from env values. */
export const normalizeWorkersAiModelId = model => {
  const id = String(model || "").trim();
  if (!id) return id;
  if (id.startsWith("@cf/")) return id;
  if (id.startsWith("cf/")) return `@${id}`;
  return id;
};

/** @param {Record<string, string | undefined>} [source] */
export const resolveCloudflareModel = (source = process.env) =>
  normalizeWorkersAiModelId(source.CLOUDFLARE_MODEL || source.VITE_CLOUDFLARE_MODEL || "");

export const isWorkersAiModel = model => String(model || "").trim().startsWith("@cf/");

/** Workers AI when Cloudflare creds exist and CLOUDFLARE_MODEL is an @cf/* id. */
export const preferWorkersAi = (source = process.env) => {
  const creds = resolveClaudeCredentials(source);
  if (!creds?.provider.startsWith("cloudflare")) return false;
  return isWorkersAiModel(resolveCloudflareModel(source));
};

/** @param {Record<string, string | undefined>} source */
const buildWorkersAiFallbacks = source => {
  const primary = resolveCloudflareModel(source);
  const secondary = normalizeWorkersAiModelId(
    source.CLOUDFLARE_FALLBACK_MODEL || source.VITE_CLOUDFLARE_FALLBACK_MODEL || ""
  );
  const chain = [];
  const seen = new Set();
  const add = m => {
    const id = String(m || "").trim();
    if (!id || !isWorkersAiModel(id) || seen.has(id)) return;
    seen.add(id);
    chain.push(id);
  };
  add(primary);
  add(secondary);
  return chain.length ? chain : ["@cf/meta/llama-3.1-70b-instruct"];
};

/** @param {object} parsedBody @param {Record<string, string | undefined>} env */
export const applyConfiguredModel = (parsedBody, env = process.env) => {
  const configured = resolveCloudflareModel(env);
  if (configured) parsedBody.model = configured;
  return parsedBody;
};

/** Gateway-native model ids (no anthropic/ prefix). @see Cloudflare AI Gateway Anthropic provider docs */
const GATEWAY_MODEL_ALIASES = {
  "claude-haiku-4-5-20251001": "claude-haiku-4-5",
  "anthropic/claude-haiku-4-5-20251001": "claude-haiku-4-5",
  "anthropic/claude-haiku-4-5": "claude-haiku-4-5",
  "claude-haiku-4-5": "claude-haiku-4-5",
  "claude-sonnet-4-6": "claude-sonnet-4-5",
  "anthropic/claude-sonnet-4-6": "claude-sonnet-4-5",
  "claude-sonnet-4-5": "claude-sonnet-4-5",
  "claude-sonnet-4-5-20250929": "claude-sonnet-4-5",
  "anthropic/claude-sonnet-4-5": "claude-sonnet-4-5",
  "claude-sonnet-4": "claude-sonnet-4",
  "anthropic/claude-sonnet-4": "claude-sonnet-4",
  "anthropic/claude-sonnet-4-20250514": "claude-sonnet-4",
};

/** Account REST API model ids (author/model). @see Cloudflare AI Gateway REST API */
const REST_MODEL_ALIASES = {
  "claude-haiku-4-5-20251001": "anthropic/claude-haiku-4-5",
  "anthropic/claude-haiku-4-5-20251001": "anthropic/claude-haiku-4-5",
  "claude-haiku-4-5": "anthropic/claude-haiku-4-5",
  "claude-sonnet-4-6": "anthropic/claude-sonnet-4-5",
  "anthropic/claude-sonnet-4-6": "anthropic/claude-sonnet-4-5",
  "claude-sonnet-4-5": "anthropic/claude-sonnet-4-5",
  "claude-sonnet-4-5-20250929": "anthropic/claude-sonnet-4-5",
  "claude-sonnet-4": "anthropic/claude-sonnet-4",
  "anthropic/claude-sonnet-4-20250514": "anthropic/claude-sonnet-4",
};

const GATEWAY_MODEL_FALLBACKS = ["claude-haiku-4-5", "claude-sonnet-4-5", "claude-sonnet-4"];

const REST_MODEL_FALLBACKS = [
  "anthropic/claude-haiku-4-5",
  "anthropic/claude-sonnet-4-5",
  "anthropic/claude-sonnet-4",
];

export const mapModelForGateway = model => {
  const id = String(model || "").trim();
  if (!id) return id;
  if (GATEWAY_MODEL_ALIASES[id]) return GATEWAY_MODEL_ALIASES[id];
  if (id.startsWith("anthropic/")) return id.slice("anthropic/".length);
  if (id.startsWith("claude-")) return GATEWAY_MODEL_ALIASES[id] || id;
  return id;
};

export const mapModelForRest = model => {
  const id = String(model || "").trim();
  if (!id) return id;
  if (id.startsWith("@cf/")) return id;
  if (REST_MODEL_ALIASES[id]) return REST_MODEL_ALIASES[id];
  if (id.startsWith("anthropic/")) return id;
  if (id.startsWith("claude-")) return REST_MODEL_ALIASES[id] || `anthropic/${id}`;
  return id;
};

/** @deprecated Use mapModelForRest */
export const mapModelForCloudflare = mapModelForRest;

const buildGatewayUrl = (accountId, gatewayId) =>
  `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/anthropic/v1/messages`;

const buildRestUrl = accountId =>
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/messages`;

const buildChatCompletionsUrl = accountId =>
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`;

/** @param {string | Array<{ type?: string, text?: string }>} content */
export const anthropicContentToString = content => {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter(b => b?.type === "text" && b.text)
      .map(b => b.text)
      .join("\n");
  }
  return String(content ?? "");
};

/** Anthropic Messages body → OpenAI chat completions (Workers AI @cf models). */
export const anthropicMessagesBodyToOpenAI = body => {
  const messages = [];
  if (body.system) {
    messages.push({ role: "system", content: anthropicContentToString(body.system) });
  }
  for (const msg of body.messages || []) {
    if (msg.role === "assistant" || msg.role === "user") {
      messages.push({ role: msg.role, content: anthropicContentToString(msg.content) });
    }
  }
  const out = {
    model: body.model,
    messages,
    max_tokens: body.max_tokens ?? 1024,
  };
  if (body.temperature != null) out.temperature = body.temperature;
  return out;
};

/** OpenAI chat completion JSON → Anthropic Messages response shape for the client. */
export const openAIChatCompletionToAnthropic = json => {
  const text = json.choices?.[0]?.message?.content ?? "";
  return {
    id: json.id || "msg_workers_ai",
    type: "message",
    role: "assistant",
    model: json.model,
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
    usage: json.usage
      ? {
          input_tokens: json.usage.prompt_tokens,
          output_tokens: json.usage.completion_tokens,
        }
      : undefined,
  };
};

/**
 * @param {Record<string, string | undefined>} source
 * @returns {{ provider: ClaudeProvider, token: string, accountId?: string, gatewayId: string, messagesUrl: string } | { provider: "anthropic", token: string, messagesUrl: string } | null}
 */
export const resolveClaudeCredentials = (source = process.env) => {
  const cfToken = (source.CLOUDFLARE_API_TOKEN || "").trim();
  const accountId = (source.CLOUDFLARE_ACCOUNT_ID || "").trim();
  const gatewayId = (source.CLOUDFLARE_AI_GATEWAY_ID || DEFAULT_CLOUDFLARE_GATEWAY_ID).trim();

  if (cfToken && accountId) {
    if (isWorkersAiModel(resolveCloudflareModel(source))) {
      return {
        provider: "cloudflare-workers-chat",
        token: cfToken,
        accountId,
        gatewayId,
        messagesUrl: buildChatCompletionsUrl(accountId),
      };
    }
    return {
      provider: "cloudflare-gateway",
      token: cfToken,
      accountId,
      gatewayId,
      messagesUrl: buildGatewayUrl(accountId, gatewayId),
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

/** @param {{ provider: "cloudflare-gateway", token: string, accountId: string, gatewayId: string }} gatewayCreds */
export const toRestCredentials = gatewayCreds => ({
  provider: "cloudflare-rest",
  token: gatewayCreds.token,
  accountId: gatewayCreds.accountId,
  gatewayId: gatewayCreds.gatewayId,
  messagesUrl: buildRestUrl(gatewayCreds.accountId),
});

export const getClaudeProviderStatus = (source = process.env) => {
  const creds = resolveClaudeCredentials(source);
  const model = resolveCloudflareModel(source) || null;
  if (!creds) {
    return { configured: false, provider: null, gatewayId: null, messagesHost: null, model, workersAi: false };
  }
  let messagesHost = null;
  try {
    messagesHost = new URL(creds.messagesUrl).host;
  } catch {
    messagesHost = creds.messagesUrl;
  }
  return {
    configured: true,
    provider: creds.provider,
    gatewayId: creds.provider.startsWith("cloudflare") ? creds.gatewayId : null,
    messagesHost,
    model,
    workersAi: preferWorkersAi(source),
  };
};

export const claudeCredentialsMissingMessage = () =>
  "Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in .env.local (or Vercel env), " +
  "or set ANTHROPIC_API_KEY for direct Anthropic access.";

const buildModelFallbackChain = (requestedModel, mapModel, staticFallbacks) => {
  const primary = mapModel(requestedModel);
  const chain = [];
  const seen = new Set();
  const add = m => {
    const id = String(m || "").trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    chain.push(id);
  };
  add(primary);
  for (const m of staticFallbacks) add(m);
  return chain.length ? chain : staticFallbacks;
};

/**
 * @param {string} bodyString
 * @param {{ provider: ClaudeProvider }} creds
 * @param {(model: string) => string} mapModel
 */
export const prepareClaudeMessagesBody = (bodyString, creds, mapModel) => {
  if (creds.provider === "anthropic") return bodyString;
  const mapper = mapModel || (creds.provider === "cloudflare-gateway" ? mapModelForGateway : mapModelForRest);
  try {
    const payload = JSON.parse(bodyString);
    if (payload.model) payload.model = mapper(payload.model);
    return JSON.stringify(payload);
  } catch {
    return bodyString;
  }
};

/** @param {{ provider: ClaudeProvider, token: string, gatewayId?: string }} creds */
export const buildClaudeRequestHeaders = creds => {
  if (creds.provider === "cloudflare-gateway") {
    return {
      "content-type": "application/json",
      "cf-aig-authorization": `Bearer ${creds.token}`,
      "anthropic-version": "2023-06-01",
    };
  }
  if (creds.provider === "cloudflare-rest" || creds.provider === "cloudflare-workers-chat") {
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

export const parseClaudeErrorMessage = (status, bodyText, json = null) => {
  const parsed = json ?? (() => {
    try {
      return JSON.parse(bodyText);
    } catch {
      return null;
    }
  })();

  const candidates = [
    parsed?.error?.message,
    parsed?.error?.error?.message,
    parsed?.message,
    parsed?.errors?.[0]?.message,
    typeof parsed?.error === "string" ? parsed.error : null,
    bodyText?.trim(),
  ].filter(Boolean);

  const msg = candidates[0] || `HTTP ${status}`;
  return String(msg);
};

export const isModelNotFoundError = (status, message) => {
  if (status !== 400 && status !== 404) return false;
  const lower = String(message || "").toLowerCase();
  return lower.includes("model not found") || lower.includes("model_not_found");
};

export function claudeProxyErrorMessage(err, creds) {
  const base = anthropicProxyErrorMessage(err);
  if (!creds) return base;
  if (creds.provider.startsWith("cloudflare")) {
    return base.replace(/api\.anthropic\.com/g, "gateway.ai.cloudflare.com");
  }
  return base;
}

/**
 * @param {object} parsedBody
 * @param {{ provider: ClaudeProvider, token: string, messagesUrl: string, gatewayId?: string }} creds
 * @param {(model: string) => string} mapModel
 * @param {string[]} staticFallbacks
 * @param {number} attempts
 */
async function tryClaudeStrategy(parsedBody, creds, mapModel, staticFallbacks, attempts) {
  const models = buildModelFallbackChain(parsedBody?.model, mapModel, staticFallbacks);
  let lastResponse = null;

  for (const model of models) {
    const body = JSON.stringify({ ...parsedBody, model });
    const headers = buildClaudeRequestHeaders(creds);
    const response = await fetchAnthropicWithRetry(
      creds.messagesUrl,
      { method: "POST", headers, body },
      attempts
    );

    if (response.ok) return response;

    const bodyText = await response.text();
    lastResponse = new Response(bodyText, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });

    const errMsg = parseClaudeErrorMessage(response.status, bodyText);
    if (!isModelNotFoundError(response.status, errMsg)) {
      return lastResponse;
    }
  }

  return lastResponse;
}

/**
 * @param {object} parsedBody
 * @param {{ provider: "cloudflare-workers-chat", token: string, messagesUrl: string, gatewayId?: string }} creds
 * @param {string[]} staticFallbacks
 * @param {number} attempts
 */
async function tryWorkersAiChatStrategy(parsedBody, creds, staticFallbacks, attempts) {
  const models = buildModelFallbackChain(parsedBody?.model, m => m, staticFallbacks);
  let lastResponse = null;

  for (const model of models) {
    const openAiBody = anthropicMessagesBodyToOpenAI({ ...parsedBody, model });
    const headers = buildClaudeRequestHeaders(creds);
    const response = await fetchAnthropicWithRetry(
      creds.messagesUrl,
      { method: "POST", headers, body: JSON.stringify(openAiBody) },
      attempts
    );

    const bodyText = await response.text();
    if (response.ok) {
      let json;
      try {
        json = JSON.parse(bodyText);
      } catch {
        return new Response(bodyText, { status: 502, statusText: "Invalid JSON from Workers AI" });
      }
      const anthropicShape = openAIChatCompletionToAnthropic(json);
      return new Response(JSON.stringify(anthropicShape), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    lastResponse = new Response(bodyText, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });

    const errMsg = parseClaudeErrorMessage(response.status, bodyText);
    if (!isModelNotFoundError(response.status, errMsg)) {
      return lastResponse;
    }
  }

  return lastResponse;
}

/**
 * Forward a Messages API request body to Cloudflare AI Gateway or Anthropic.
 * @param {string} bodyString
 * @param {Record<string, string | undefined>} [env]
 * @param {number} [attempts]
 */
export async function proxyClaudeMessages(bodyString, env = process.env, attempts = 3) {
  const creds = resolveClaudeCredentials(env);
  if (!creds) {
    throw new Error(claudeCredentialsMissingMessage());
  }

  let parsedBody;
  try {
    parsedBody = JSON.parse(bodyString);
  } catch {
    throw new Error("Invalid JSON body for Claude messages request");
  }

  applyConfiguredModel(parsedBody, env);

  if (creds.provider === "anthropic") {
    const headers = buildClaudeRequestHeaders(creds);
    return fetchAnthropicWithRetry(
      creds.messagesUrl,
      { method: "POST", headers, body: bodyString },
      attempts
    );
  }

  if (creds.provider === "cloudflare-gateway") {
    let response = await tryClaudeStrategy(
      parsedBody,
      creds,
      mapModelForGateway,
      GATEWAY_MODEL_FALLBACKS,
      attempts
    );
    if (response?.ok) return response;

    const restCreds = toRestCredentials(creds);
    response = await tryClaudeStrategy(
      parsedBody,
      restCreds,
      mapModelForRest,
      REST_MODEL_FALLBACKS,
      attempts
    );
    if (response) return response;

    throw new Error("Cloudflare Claude request failed after gateway and REST fallbacks");
  }

  if (creds.provider === "cloudflare-workers-chat") {
    return tryWorkersAiChatStrategy(parsedBody, creds, buildWorkersAiFallbacks(env), attempts);
  }

  const restFallbacks = REST_MODEL_FALLBACKS;
  return tryClaudeStrategy(parsedBody, creds, mapModelForRest, restFallbacks, attempts);
}
