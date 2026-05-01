import dns from "node:dns";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Prefer IPv4 when resolving api.anthropic.com — broken IPv6 routes often surface as undici "fetch failed".
dns.setDefaultResultOrder("ipv4first");

function anthropicProxyErrorMessage(err) {
  const base = err?.message || "Anthropic proxy request failed";
  const cause = err?.cause;
  const code = cause?.code || err?.code;
  const hints = {
    ENOTFOUND:
      "DNS could not resolve api.anthropic.com. Add ANTHROPIC_DNS_SERVERS=8.8.8.8,1.1.1.1 to .env.local and restart dev, or fix system / VPN / router DNS (Pi-hole and some VPNs block or mis-resolve API hosts).",
    ECONNREFUSED: "Connection refused — often a firewall or proxy blocking outbound HTTPS.",
    ECONNRESET: "Connection reset — network instability or TLS interception.",
    ETIMEDOUT: "Timed out — VPN, firewall, or captive portal may be blocking API access.",
    UNABLE_TO_GET_ISSUER_CERT_LOCALLY: "TLS certificate trust issue — corporate SSL inspection or outdated CA store.",
    CERT_HAS_EXPIRED: "TLS certificate problem — check system date/time.",
  };
  const hint = code ? hints[code] : "";
  const codeTag = code ? ` [${code}]` : "";
  if (base === "fetch failed" && !hint) {
    return `Could not reach api.anthropic.com${codeTag}. Try disabling VPN, allowlisting Anthropic, or run: curl -I https://api.anthropic.com`;
  }
  return [base + codeTag, hint].filter(Boolean).join(" ");
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const shouldRetryAnthropicRequest = (status, err) => {
  if (status === 429 || status === 502 || status === 503 || status === 504) return true;
  const code = err?.cause?.code || err?.code || "";
  return ["ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT", "ECONNRESET", "ECONNREFUSED"].includes(code);
};

async function fetchAnthropicWithRetry(url, init, attempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, init);
      if (!shouldRetryAnthropicRequest(response.status, null) || attempt === attempts) {
        return response;
      }
      await sleep(400 * attempt);
    } catch (err) {
      lastError = err;
      if (!shouldRetryAnthropicRequest(null, err) || attempt === attempts) {
        throw err;
      }
      await sleep(400 * attempt);
    }
  }
  throw lastError || new Error("Anthropic proxy exhausted retries");
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  const dnsServers = (env.ANTHROPIC_DNS_SERVERS || process.env.ANTHROPIC_DNS_SERVERS || "")
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  if (dnsServers.length) {
    dns.setServers(dnsServers);
  }

  return {
    plugins: [
      react(),
      {
        name: "anthropic-dev-proxy",
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
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
