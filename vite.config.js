import dns from "node:dns";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { anthropicProxyErrorMessage, fetchAnthropicWithRetry } from "./server/anthropic-upstream.mjs";

async function proxyNdbcSpec(req, res, stationId) {
  const id = String(stationId || "").replace(/\D/g, "");
  if (!id) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "text/plain");
    res.end("Invalid station id");
    return;
  }
  try {
    const upstream = await fetch(`https://www.ndbc.noaa.gov/data/realtime2/${id}.spec`, {
      headers: { "user-agent": "SurfIntel/1.0" },
    });
    const text = await upstream.text();
    res.statusCode = upstream.status;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.end(text);
  } catch (e) {
    console.error("[ndbc-dev-proxy] fetch failed:", e);
    res.statusCode = 502;
    res.setHeader("Content-Type", "text/plain");
    res.end("NDBC upstream error");
  }
}

// Prefer IPv4 when resolving api.anthropic.com — broken IPv6 routes often surface as undici "fetch failed".
dns.setDefaultResultOrder("ipv4first");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  const dnsServers = (env.ANTHROPIC_DNS_SERVERS || process.env.ANTHROPIC_DNS_SERVERS || "")
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  const fallbackPublic = ["8.8.8.8", "1.1.1.1"];
  if (dnsServers.length) {
    dns.setServers(dnsServers);
  } else {
    const current = dns.getServers().filter(Boolean);
    const merged = [...current, ...fallbackPublic.filter(ip => !current.includes(ip))];
    if (merged.length) dns.setServers(merged);
  }

  return {
    plugins: [
      react(),
      {
        name: "anthropic-dev-proxy",
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            const ndbcMatch = req.url?.match(/^\/api\/ndbc\/([^/]+)\/spec\/?$/);
            if (req.method === "GET" && ndbcMatch) {
              return proxyNdbcSpec(req, res, ndbcMatch[1]);
            }
            if (req.method !== "POST" || !req.url?.startsWith("/api/anthropic/messages")) {
              return next();
            }

            const key = (env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || "").trim();
            if (!key) {
              res.statusCode = 503;
              res.setHeader("Content-Type", "application/json");
              res.end(
                JSON.stringify({
                  error: {
                    message:
                      "ANTHROPIC_API_KEY is not set. Add it to .env.local and restart npm run dev.",
                  },
                })
              );
              return;
            }

            const chunks = [];
            for await (const chunk of req) chunks.push(chunk);
            const body = Buffer.concat(chunks).toString("utf8");

            try {
              const r = await fetchAnthropicWithRetry("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  "x-api-key": key,
                  "anthropic-version": "2023-06-01",
                },
                body,
              }, 3);
              const buf = Buffer.from(await r.arrayBuffer());
              res.statusCode = r.status;
              const ct = r.headers.get("content-type") || "application/json";
              res.setHeader("Content-Type", ct);
              res.end(buf);
            } catch (e) {
              console.error("[anthropic-dev-proxy] upstream fetch failed:", e);
              res.statusCode = 502;
              res.setHeader("Content-Type", "application/json");
              res.end(
                JSON.stringify({
                  error: { message: anthropicProxyErrorMessage(e) },
                })
              );
            }
          });
        },
      },
    ],
  };
});
