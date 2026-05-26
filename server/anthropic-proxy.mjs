/**
 * Standalone Anthropic proxy for `npm run preview` or any static host
 * that can run a small Node process alongside the build.
 *
 * Usage: CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... node server/anthropic-proxy.mjs
 *    or: ANTHROPIC_API_KEY=sk-ant-... node server/anthropic-proxy.mjs
 * Default listen: http://127.0.0.1:8787
 *
 * Then: VITE_ANTHROPIC_PROXY_URL=http://127.0.0.1:8787/v1/messages npm run preview
 * (or omit the path — the app normalizes bare origins to /v1/messages.)
 */
import http from "node:http";
import dns from "node:dns";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  claudeCredentialsMissingMessage,
  proxyClaudeMessages,
  resolveClaudeCredentials,
} from "./claude-upstream.mjs";
import { fetchNdbcSpecUpstream } from "./ndbc-upstream.mjs";

dns.setDefaultResultOrder("ipv4first");
{
  const fromEnv = (process.env.ANTHROPIC_DNS_SERVERS || "").trim().split(/[\s,]+/).filter(Boolean);
  const fallbackPublic = ["8.8.8.8", "1.1.1.1"];
  if (fromEnv.length) {
    dns.setServers(fromEnv);
  } else {
    const current = dns.getServers().filter(Boolean);
    const merged = [...current, ...fallbackPublic.filter(ip => !current.includes(ip))];
    if (merged.length) dns.setServers(merged);
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadEnvFromFiles() {
  const merged = { ...process.env };
  for (const name of [".env.local", ".env"]) {
    const p = path.join(root, name);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m || m[1].startsWith("#")) continue;
      merged[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  }
  return merged;
}

const env = loadEnvFromFiles();
const creds = resolveClaudeCredentials(env);
const PORT = Number(process.env.ANTHROPIC_PROXY_PORT || 8787);

if (!creds) {
  console.error(claudeCredentialsMissingMessage());
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const ndbcMatch = req.url?.match(/^\/api\/ndbc\/([^/]+)\/spec\/?$/);
  if (req.method === "GET" && ndbcMatch) {
    try {
      const result = await fetchNdbcSpecUpstream(ndbcMatch[1]);
      res.writeHead(result.status, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      });
      res.end(result.text);
    } catch (e) {
      res.writeHead(502, { "Content-Type": "text/plain" });
      res.end(e?.message || "NDBC upstream error");
    }
    return;
  }

  if (req.method !== "POST" || req.url !== "/v1/messages") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: "POST /v1/messages only" } }));
    return;
  }

  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks).toString("utf8");

  try {
    const r = await proxyClaudeMessages(body, env, 3);
    const buf = Buffer.from(await r.arrayBuffer());
    res.writeHead(r.status, { "Content-Type": r.headers.get("content-type") || "application/json" });
    res.end(buf);
  } catch (e) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: e?.message || "Upstream error" } }));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(
    `Claude proxy (${creds.provider}) listening on http://127.0.0.1:${PORT} (POST /v1/messages)`
  );
});
