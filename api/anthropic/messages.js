/**
 * Vercel Serverless Function: same path as Vite dev proxy (`POST /api/anthropic/messages`).
 * Credentials (server-side, no VITE_ prefix):
 *   - CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID (routes via gateway.ai.cloudflare.com)
 *   - CLOUDFLARE_AI_GATEWAY_ID (defaults to "default")
 *   - CLOUDFLARE_MODEL=@cf/... for Workers AI (no Anthropic billing)
 *   - or ANTHROPIC_API_KEY (legacy direct Anthropic)
 */
import dns from "node:dns";
import {
  claudeCredentialsMissingMessage,
  claudeProxyErrorMessage,
  proxyClaudeMessages,
  resolveClaudeCredentials,
} from "../../server/claude-upstream.mjs";

dns.setDefaultResultOrder("ipv4first");

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: { message: "Method not allowed" } }));
    return;
  }

  const creds = resolveClaudeCredentials(process.env);
  if (!creds) {
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: {
          message: `${claudeCredentialsMissingMessage()} Add them in Vercel → Settings → Environment Variables.`,
        },
      })
    );
    return;
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString("utf8");

  try {
    const r = await proxyClaudeMessages(body, process.env, 3);
    const buf = Buffer.from(await r.arrayBuffer());
    res.statusCode = r.status;
    res.setHeader("Content-Type", r.headers.get("content-type") || "application/json");
    res.end(buf);
  } catch (e) {
    console.error("[api/anthropic/messages] upstream fetch failed:", e);
    res.statusCode = 502;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: { message: claudeProxyErrorMessage(e, creds) } }));
  }
}
