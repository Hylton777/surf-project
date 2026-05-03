/**
 * Standalone Anthropic proxy for `npm run preview` or any static host
 * that can run a small Node process alongside the build.
 *
 * Usage: ANTHROPIC_API_KEY=sk-ant-... node server/anthropic-proxy.mjs
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

function readKeyFromEnvFiles() {
  if (process.env.ANTHROPIC_API_KEY?.trim()) return process.env.ANTHROPIC_API_KEY.trim();
  for (const name of [".env.local", ".env"]) {
    const p = path.join(root, name);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*ANTHROPIC_API_KEY\s*=\s*(.+)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, "").trim();
    }
  }
  return "";
}

const API_KEY = readKeyFromEnvFiles();
const PORT = Number(process.env.ANTHROPIC_PROXY_PORT || 8787);

if (!API_KEY) {
  console.error("Missing ANTHROPIC_API_KEY (env or .env.local). Exiting.");
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
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
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body,
    });
    const buf = Buffer.from(await r.arrayBuffer());
    res.writeHead(r.status, { "Content-Type": r.headers.get("content-type") || "application/json" });
    res.end(buf);
  } catch (e) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: e?.message || "Upstream error" } }));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Anthropic proxy listening on http://127.0.0.1:${PORT} (POST /v1/messages)`);
});
