import dns from "node:dns";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { handleClaudeStatus } from "./server/claude-status.mjs";
import {
  claudeCredentialsMissingMessage,
  claudeProxyErrorMessage,
  getClaudeProviderStatus,
  parseClaudeErrorMessage,
  proxyClaudeMessages,
  resolveClaudeCredentials,
} from "./server/claude-upstream.mjs";
import { fetchNdbcSpecUpstream } from "./server/ndbc-upstream.mjs";

async function proxyNdbcSpec(req, res, stationId) {
  try {
    const result = await fetchNdbcSpecUpstream(stationId);
    res.statusCode = result.status;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.end(result.text);
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

  const cloudflareModel = (env.CLOUDFLARE_MODEL || env.VITE_CLOUDFLARE_MODEL || "").trim();
  const cloudflareSpotModel = (
    env.CLOUDFLARE_SPOT_CONFIG_MODEL || env.VITE_CLOUDFLARE_SPOT_CONFIG_MODEL || cloudflareModel
  ).trim();

  return {
    define: {
      "import.meta.env.VITE_CLOUDFLARE_MODEL": JSON.stringify(cloudflareModel),
      "import.meta.env.VITE_CLOUDFLARE_SPOT_CONFIG_MODEL": JSON.stringify(cloudflareSpotModel),
    },
    plugins: [
      react(),
      {
        name: "anthropic-dev-proxy",
        configureServer(server) {
          let claudeRouteLogged = false;
          server.middlewares.use(async (req, res, next) => {
            const ndbcMatch = req.url?.match(/^\/api\/ndbc\/([^/]+)\/spec\/?$/);
            if (req.method === "GET" && ndbcMatch) {
              return proxyNdbcSpec(req, res, ndbcMatch[1]);
            }
            if (req.method === "GET" && req.url?.replace(/\?.*$/, "") === "/api/claude/status") {
              return handleClaudeStatus(req, res, { ...process.env, ...env });
            }
            if (req.method !== "POST" || !req.url?.startsWith("/api/anthropic/messages")) {
              return next();
            }

            const mergedEnv = { ...process.env, ...env };
            const creds = resolveClaudeCredentials(mergedEnv);
            if (!claudeRouteLogged && creds) {
              const status = getClaudeProviderStatus(mergedEnv);
              const modelLabel = status.model || "client default";
              console.info(
                `[ai-proxy] ${status.provider} → ${status.gatewayId || "n/a"} (${status.messagesHost}) model=${modelLabel}`
              );
              claudeRouteLogged = true;
            }
            if (!creds) {
              res.statusCode = 503;
              res.setHeader("Content-Type", "application/json");
              res.end(
                JSON.stringify({
                  error: {
                    message: `${claudeCredentialsMissingMessage()} Restart npm run dev after updating .env.local.`,
                  },
                })
              );
              return;
            }

            const chunks = [];
            for await (const chunk of req) chunks.push(chunk);
            const body = Buffer.concat(chunks).toString("utf8");

            try {
              const r = await proxyClaudeMessages(body, mergedEnv, 3);
              const buf = Buffer.from(await r.arrayBuffer());
              res.statusCode = r.status;
              const ct = r.headers.get("content-type") || "application/json";
              res.setHeader("Content-Type", ct);
              if (!r.ok) {
                const errMsg = parseClaudeErrorMessage(r.status, buf.toString("utf8"));
                console.warn("[claude-proxy] upstream error:", errMsg);
              }
              res.end(buf);
            } catch (e) {
              console.error("[anthropic-dev-proxy] upstream fetch failed:", e);
              res.statusCode = 502;
              res.setHeader("Content-Type", "application/json");
              res.end(
                JSON.stringify({
                  error: { message: claudeProxyErrorMessage(e, creds) },
                })
              );
            }
          });
        },
      },
    ],
  };
});
