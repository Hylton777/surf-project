/**
 * Vercel Serverless Function: same path as Vite dev proxy (`POST /api/anthropic/messages`).
 * Set `ANTHROPIC_API_KEY` in the Vercel project (Sensitive). Do not use the `VITE_` prefix for the key.
 */
import dns from "node:dns";
import { anthropicProxyErrorMessage, fetchAnthropicWithRetry } from "../../server/anthropic-upstream.mjs";

dns.setDefaultResultOrder("ipv4first");

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: { message: "Method not allowed" } }));
    return;
  }

  const key = (process.env.ANTHROPIC_API_KEY || "").trim();
  if (!key) {
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: {
          message:
            "ANTHROPIC_API_KEY is not set on the server. Add it in Vercel → Settings → Environment Variables.",
        },
      })
    );
    return;
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString("utf8");

  try {
    const r = await fetchAnthropicWithRetry(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body,
      },
      3
    );
    const buf = Buffer.from(await r.arrayBuffer());
    res.statusCode = r.status;
    res.setHeader("Content-Type", r.headers.get("content-type") || "application/json");
    res.end(buf);
  } catch (e) {
    console.error("[api/anthropic/messages] upstream fetch failed:", e);
    res.statusCode = 502;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: { message: anthropicProxyErrorMessage(e) } }));
  }
}
