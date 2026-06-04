import { roundHalfFt, M_TO_FT } from "../forecast/surfForecast.js";

export const mToFt = m => m * M_TO_FT;
export const fmtFt = (m, d = 1) => roundHalfFt(mToFt(m)).toFixed(d);

export const fmtSurfFt = ft => {
  const rounded = roundHalfFt(ft);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};

export const degToCompass = deg => {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
};

export const normalizeSpotName = name => String(name || "").trim().toLowerCase().replace(/\s+/g, " ");

export const createSpotId = name =>
  `custom_${normalizeSpotName(name).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "spot"}_${Date.now().toString(36)}`;

export const deriveCityFromPlaceOrLabel = (placeOrLabel, fallback = "Custom") => {
  const s = String(placeOrLabel || "").trim();
  if (!s) return fallback;
  const parts = s.split(",").map(x => x.trim()).filter(Boolean);
  if (!parts.length) return fallback;
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    if (/^[A-Z]{2}$/i.test(last)) return parts[parts.length - 2] || parts[0];
  }
  return parts[0];
};
