/**
 * Shared Anthropic HTTPS fetch + retries (Vite dev proxy, Vercel serverless, standalone proxy).
 */

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function anthropicProxyErrorMessage(err) {
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

const shouldRetryAnthropicRequest = (status, err) => {
  if (status === 429 || status === 502 || status === 503 || status === 504) return true;
  const code = err?.cause?.code || err?.code || "";
  return ["ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT", "ECONNRESET", "ECONNREFUSED"].includes(code);
};

export async function fetchAnthropicWithRetry(url, init, attempts = 3) {
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
