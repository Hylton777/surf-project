export const normalizeWorkersAiModelId = model => {
  const id = String(model || "").trim();
  if (!id) return id;
  if (id.startsWith("@cf/")) return id;
  if (id.startsWith("cf/")) return `@${id}`;
  return id;
};

export const getAiModel = () =>
  normalizeWorkersAiModelId(
    import.meta.env.VITE_CLOUDFLARE_MODEL || import.meta.env.VITE_ANTHROPIC_MODEL || "@cf/meta/llama-3.1-70b-instruct"
  );

export const getAiFallbackModel = () =>
  (import.meta.env.VITE_CLOUDFLARE_FALLBACK_MODEL || import.meta.env.VITE_ANTHROPIC_FALLBACK_MODEL || getAiModel()).trim();

export const getAiSpotConfigModel = () =>
  (import.meta.env.VITE_CLOUDFLARE_SPOT_CONFIG_MODEL || import.meta.env.VITE_ANTHROPIC_SPOT_CONFIG_MODEL || getAiModel()).trim();

/** Vite dev: `/api/anthropic/messages`. Standalone proxy: `origin` + `/v1/messages`. */
export const getAnthropicMessagesUrl = () => {
  const raw = (import.meta.env.VITE_ANTHROPIC_PROXY_URL || "").trim();
  if (!raw) return "/api/anthropic/messages";
  if (!/^https?:\/\//i.test(raw)) return raw;
  try {
    const u = new URL(raw);
    let p = (u.pathname || "/").replace(/\/+$/, "");
    if (!p || p === "/") p = "/v1/messages";
    u.pathname = p;
    return u.toString();
  } catch {
    return raw;
  }
};

export const isLikelyTransientAiError = msg => {
  const m = String(msg || "").toLowerCase();
  return (
    m.includes("enotfound") ||
    m.includes("etimedout") ||
    m.includes("econnreset") ||
    m.includes("eai_again") ||
    m.includes("dns") ||
    m.includes("network") ||
    m.includes("fetch failed") ||
    m.includes("502") ||
    m.includes("503") ||
    m.includes("504") ||
    m.includes("429")
  );
};

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
