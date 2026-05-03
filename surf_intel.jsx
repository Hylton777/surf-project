import React, { useState, useEffect } from "react";

// ─── Data ───────────────────────────────────────────────────────────────────

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Space+Mono:wght@400;700&family=Inter:wght@300;400;500;600&display=swap');`;

const SPOTS = [
  { id: "ob", name: "Ocean Beach", shortName: "OB", lat: 37.7594, lon: -122.5107, type: "Beach Break", difficulty: "Intermediate", city: "San Francisco", tideStationId: "9414290", tideStationLabel: "San Francisco (Golden Gate)" },
  { id: "linda_mar", name: "Linda Mar", shortName: "Linda Mar", lat: 37.5841, lon: -122.4994, type: "Beach Break", difficulty: "Beginner–Inter", city: "Pacifica", tideStationId: "9414290", tideStationLabel: "San Francisco (Golden Gate)" },
  { id: "bolinas", name: "Bolinas", shortName: "Bolinas", lat: 37.9074, lon: -122.7174, type: "Point Break", difficulty: "Intermediate", city: "Marin", tideStationId: "9414958", tideStationLabel: "Bolinas Lagoon" },
  { id: "stinson", name: "Stinson Beach", shortName: "Stinson", lat: 37.8996, lon: -122.6416, type: "Beach Break", difficulty: "Beginner", city: "Marin", tideStationId: "9415020", tideStationLabel: "Point Reyes" },
  { id: "mavs", name: "Mavericks", shortName: "Mavs", lat: 37.4953, lon: -122.5003, type: "Reef Break", difficulty: "Expert Only", city: "Half Moon Bay", tideStationId: "9414131", tideStationLabel: "Pillar Point Harbor" },
  { id: "pleasure_point", name: "Pleasure Point", shortName: "Pleasure Point", lat: 36.9569, lon: -121.9817, type: "Point Break", difficulty: "Intermediate", city: "Santa Cruz", tideStationId: "9413745", tideStationLabel: "Santa Cruz, Monterey Bay" },
];

const BOARDS = [
  { id: "longboard", name: "Longboard", size: '9\'0"+', desc: "Easy paddle, smooth cruising" },
  { id: "funboard", name: "Funboard", size: "7\'–8\'6\"", desc: "Versatile all-rounder" },
  { id: "mid_length", name: "Mid-length", size: "6\'6\"–8\'0\"", desc: "Modern cruiser" },
  { id: "fish", name: "Fish", size: "5\'4\"–6\'4\"", desc: "Small wave machine" },
  { id: "shortboard", name: "Shortboard", size: "5\'8\"–6\'6\"", desc: "Performance surfing" },
  { id: "gun", name: "Gun / Step-up", size: "7\'0\"+", desc: "For serious swell" },
];

const SKILLS = ["Beginner", "Intermediate", "Advanced", "Expert"];

const THEME = {
  bg: "#dff4ff",
  bgSoft: "#f2fbff",
  panel: "#ffffff",
  panelAlt: "#fff8ec",
  border: "#bfe4ee",
  text: "#0f4f66",
  textStrong: "#0a3f52",
  textSoft: "#4f8ca3",
  muted: "#79aebf",
  accent: "#2bb7a7",
  accentSoft: "rgba(43,183,167,0.16)",
};

const SCENIC_BG_URL = "/surf-bg.png";

const POSTCARD_BG = `
  linear-gradient(180deg, rgba(232,247,255,0.72) 0%, rgba(222,242,248,0.76) 42%, rgba(247,237,214,0.8) 100%),
  radial-gradient(circle at 18% 14%, rgba(255,255,255,0.78) 0%, rgba(255,255,255,0.18) 34%),
  linear-gradient(180deg, rgba(9, 55, 74, 0.08) 0%, rgba(9, 55, 74, 0.04) 60%, rgba(9, 55, 74, 0.02) 100%),
  url("${SCENIC_BG_URL}"),
  linear-gradient(
    180deg,
    #b9ecff 0%,
    #8dd9f3 30%,
    #75d1cd 52%,
    #f4e3bf 53%,
    #efd6a8 100%
  )
`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mToFt = m => m * 3.28084;
const fmtFt = (m, d = 1) => mToFt(m).toFixed(d);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Vite dev: `/api/anthropic/messages`. Standalone proxy: `origin` + `/v1/messages`. */
const getAnthropicMessagesUrl = () => {
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

const degToCompass = deg => {
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
};

const getCurrentHourIdx = times => {
  if (!times?.length) return 0;
  const now = Date.now();
  let idx = 0;
  for (let i = 0; i < times.length; i++) {
    if (new Date(times[i]).getTime() <= now) idx = i;
    else break;
  }
  return Math.max(0, idx);
};

/** Match the forecast hour in `secondaryTimes` to `primaryTimes[hi]` so wave vs wind stay the same clock hour. */
const alignHourIdx = (primaryTimes, secondaryTimes, hi) => {
  if (!primaryTimes?.length || !secondaryTimes?.length) return hi;
  const t = primaryTimes[hi];
  if (t == null) return Math.min(Math.max(0, hi), secondaryTimes.length - 1);
  const j = secondaryTimes.indexOf(t);
  return j !== -1 ? j : Math.min(Math.max(0, hi), secondaryTimes.length - 1);
};

const getRating = (heightM, periodS) => {
  const ft = mToFt(heightM);
  if (ft < 1)  return { label: "FLAT",    color: "#3a5570" };
  if (ft < 2.5) return { label: "SMALL",   color: "#5a7a9a" };
  if (ft < 4 && periodS >= 10) return { label: "FUN",  color: "#0eb8a0" };
  if (ft < 4)  return { label: "WEAK",    color: "#7a9aaa" };
  if (ft < 7 && periodS >= 12) return { label: "EPIC", color: "#ff8c42" };
  if (ft < 7)  return { label: "SOLID",   color: "#0eb8a0" };
  if (ft < 12) return { label: "PUMPING", color: "#e84545" };
  return       { label: "MAXING",  color: "#c0392b" };
};

const getRatingDisplayColor = label => {
  const map = {
    FLAT: "#d73027",
    SMALL: "#f46d43",
    WEAK: "#fdae61",
    FUN: "#66bd63",
    SOLID: "#1a9850",
    EPIC: "#1a9850",
    PUMPING: "#0b7d3e",
    MAXING: "#0a5f30",
  };
  return map[label] || THEME.textSoft;
};

const isLikelyTransientAiError = msg => {
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

const normalizeSpotName = name => String(name || "").trim().toLowerCase().replace(/\s+/g, " ");

const createSpotId = name =>
  `custom_${normalizeSpotName(name).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "spot"}_${Date.now().toString(36)}`;

/** City for sidebar/header: first locality, not state (e.g. "Santa Cruz, CA" → "Santa Cruz"). */
const deriveCityFromPlaceOrLabel = (placeOrLabel, fallback = "Custom") => {
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

const VALID_SPOT_DIFFICULTIES = new Set(["Beginner", "Beginner–Inter", "Intermediate", "Expert Only"]);

const normalizeSpotDifficulty = raw => {
  let s = String(raw || "").trim();
  if (/^beginner\s*[-–—]\s*inter$/i.test(s)) s = "Beginner–Inter";
  if (VALID_SPOT_DIFFICULTIES.has(s)) return s;
  const l = s.toLowerCase();
  if (l.includes("expert") || l === "expert only") return "Expert Only";
  if (l.includes("beginner") && (l.includes("inter") || l.includes("mid"))) return "Beginner–Inter";
  if (l.includes("beginner")) return "Beginner";
  if (l.includes("intermediate")) return "Intermediate";
  if (l.includes("advanced")) return "Intermediate";
  return "Intermediate";
};

const VALID_BREAK_TYPES = new Set(["Beach Break", "Point Break", "Reef Break", "Unknown Break"]);

const normalizeBreakType = raw => {
  const s = String(raw || "").trim();
  if (VALID_BREAK_TYPES.has(s)) return s;
  const l = s.toLowerCase();
  if (l.includes("point")) return "Point Break";
  if (l.includes("reef")) return "Reef Break";
  if (l.includes("beach")) return "Beach Break";
  return "Unknown Break";
};

const getNearestTideStationMeta = (lat, lon) => {
  const nearest = SPOTS.reduce((best, s) => {
    const dLat = s.lat - lat;
    const dLon = s.lon - lon;
    const score = dLat * dLat + dLon * dLon;
    if (!best || score < best.score) return { score, spot: s };
    return best;
  }, null);
  return {
    tideStationId: nearest?.spot?.tideStationId || SPOTS[0].tideStationId,
    tideStationLabel: nearest?.spot?.tideStationLabel || SPOTS[0].tideStationLabel,
  };
};

// ─── API ─────────────────────────────────────────────────────────────────────

const fetchMarine = (lat, lon) =>
  fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&hourly=wave_height,wave_period,wave_direction,swell_wave_height,swell_wave_period,swell_wave_direction&forecast_days=2&timezone=America%2FLos_Angeles`)
    .then(r => r.json());

const fetchWind = (lat, lon) =>
  fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=wind_speed_10m,wind_direction_10m&forecast_days=2&timezone=America%2FLos_Angeles&wind_speed_unit=mph`)
    .then(r => r.json());

const fetchTides = stationId => {
  const pad = n => String(n).padStart(2, "0");
  const d = new Date();
  const t = new Date(d); t.setDate(t.getDate() + 1);
  const fmt = x => `${x.getFullYear()}${pad(x.getMonth()+1)}${pad(x.getDate())}`;
  return fetch(`https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?begin_date=${fmt(d)}&end_date=${fmt(t)}&station=${stationId}&product=predictions&datum=MLLW&time_zone=lst_ldt&interval=hilo&units=english&application=cs153&format=json`)
    .then(r => r.json());
};

const formatDriveDuration = totalSeconds => {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return null;
  const mins = Math.round(totalSeconds / 60);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins ? `${hours} hr ${remMins} min` : `${hours} hr`;
};

const parseLatLonString = value => {
  const m = String(value || "").trim().match(/^(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[3]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
};

const tomTomLabel = (result, fallback = "") =>
  result?.address?.freeformAddress ||
  [result?.address?.municipality, result?.address?.countrySubdivision, result?.address?.country]
    .filter(Boolean)
    .join(", ") ||
  fallback;

const fetchTomTomLocationOptions = async (query, apiKey, opts = {}) => {
  const parsed = parseLatLonString(query);
  if (parsed) {
    return [{
      lat: parsed.lat,
      lon: parsed.lon,
      label: `${parsed.lat.toFixed(5)},${parsed.lon.toFixed(5)}`,
    }];
  }

  const cleaned = String(query || "").trim();
  if (!cleaned) return [];

  const limit = opts.limit ?? 8;
  const params = new URLSearchParams();
  params.set("key", apiKey);
  params.set("limit", String(limit));
  if (opts.countrySet) params.set("countrySet", opts.countrySet);
  if (opts.biasLat != null && opts.biasLon != null) {
    params.set("lat", String(opts.biasLat));
    params.set("lon", String(opts.biasLon));
  }
  if (opts.radiusMeters != null) params.set("radius", String(opts.radiusMeters));

  const url = `https://api.tomtom.com/search/2/geocode/${encodeURIComponent(cleaned)}.json?${params.toString()}`;
  try {
    const res = await fetch(url);
    const json = await res.json().catch(() => ({}));
    const results = (json?.results || []).filter(r => r?.position);
    return results.map(r => ({
      lat: r.position.lat,
      lon: r.position.lon,
      label: tomTomLabel(r, cleaned),
    }));
  } catch {
    return [];
  }
};

/** Parse JSON object with zip + place from Claude response (allows markdown fences). */
const parseSurfSpotZipPayload = text => {
  const t = String(text || "").trim();
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1].trim() : t;
  const objMatch = raw.match(/\{[\s\S]*\}/);
  if (!objMatch) return null;
  try {
    const j = JSON.parse(objMatch[0]);
    const digits = String(j.zip ?? "").replace(/\D/g, "");
    const zip = digits.length >= 5 ? digits.slice(0, 5) : "";
    if (!/^\d{5}$/.test(zip)) return null;
    const place = typeof j.place === "string" ? j.place.trim() : "";
    const difficulty = typeof j.difficulty === "string" ? j.difficulty.trim() : "";
    const typeRaw = typeof j.type === "string" ? j.type.trim() : (typeof j.breakType === "string" ? j.breakType.trim() : "");
    return { zip, place, difficulty, type: typeRaw };
  } catch {
    return null;
  }
};

/**
 * Minimal-token lookup: surf spot name → US ZIP + locality hint for TomTom / forecasts.
 */
const fetchSurfSpotZipFromAnthropic = async (spotName, regionHint) => {
  const anthropicUrl = getAnthropicMessagesUrl();
  const model = (import.meta.env.VITE_ANTHROPIC_SPOT_ZIP_MODEL || import.meta.env.VITE_ANTHROPIC_MODEL || "claude-haiku-4-5-20251001").trim();
  const res = await fetch(anthropicUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: 180,
      messages: [{
        role: "user",
        content: `Surf break name: "${spotName}"
User trip context / start area (bias): ${regionHint || "California coast, USA"}

Reply with ONLY valid JSON, no other text:
{"zip":"95060","place":"Santa Cruz, CA","difficulty":"Intermediate","type":"Point Break"}

Rules:
- zip: exactly one US 5-digit ZIP for the coastal town/area where that surf break is.
- place: City name and US state abbreviation only (e.g. "Santa Cruz, CA") — city must be the first segment before the comma.
- difficulty: exactly one of: Beginner, Beginner–Inter, Intermediate, Expert Only (typical skill needed for that break).
- type: exactly one of: Beach Break, Point Break, Reef Break.

If impossible, reply exactly: {"zip":"","place":"","difficulty":"","type":""}`,
      }],
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error?.message || json.message || `HTTP ${res.status}`);
  }
  const text = json.content?.find(b => b.type === "text")?.text || "";
  return parseSurfSpotZipPayload(text);
};

/** TomTom geocode of US ZIP → lat/lon for marine/wind/routes. */
const geocodeUsZipWithTomTom = async (zip, apiKey) => {
  const opts = await fetchTomTomLocationOptions(`${zip}, USA`, apiKey, { countrySet: "US", limit: 5 });
  return opts[0] || null;
};

const resolveTomTomLocation = async (origin, apiKey, opts) => {
  const options = await fetchTomTomLocationOptions(origin, apiKey, opts || {});
  return options[0] || null;
};

const resolveTomTomOrigin = async (origin, apiKey) => {
  const loc = await resolveTomTomLocation(origin, apiKey);
  return loc ? { lat: loc.lat, lon: loc.lon } : null;
};

const fetchDriveTimes = async (spots, originInput) => {
  const apiKey = (import.meta.env.VITE_TOMTOM_API_KEY || "").trim();
  const origin = (originInput || import.meta.env.VITE_DRIVE_ORIGIN || "San Francisco, CA").trim();
  if (!apiKey || !origin || !spots?.length) return {};
  const originCoords = await resolveTomTomOrigin(origin, apiKey);
  if (!originCoords) return {};

  const requests = spots.map(async spot => {
    const routePath = `${originCoords.lat},${originCoords.lon}:${spot.lat},${spot.lon}`;
    const url = `https://api.tomtom.com/routing/1/calculateRoute/${routePath}/json?key=${encodeURIComponent(apiKey)}&travelMode=car&traffic=true&departAt=now`;
    try {
      const res = await fetch(url);
      const json = await res.json().catch(() => ({}));
      const summary = json?.routes?.[0]?.summary;
      if (!summary) return [spot.id, null];
      const totalSeconds = summary.travelTimeInSeconds || 0;
      return [spot.id, formatDriveDuration(totalSeconds)];
    } catch {
      return [spot.id, null];
    }
  });

  const entries = await Promise.all(requests);
  return Object.fromEntries(entries);
};

const fetchMissingDriveTimes = async (spots, existingDriveTimes = {}, originInput) => {
  const missing = spots.filter(s => !existingDriveTimes[s.id]);
  if (!missing.length) return {};
  return fetchDriveTimes(missing, originInput);
};

const buildSpotCondition = (spot, marineJson, windJson) => {
  if (!marineJson?.hourly) return null;
  const hi = getCurrentHourIdx(marineJson.hourly.time);
  const wi = alignHourIdx(marineJson.hourly.time, windJson?.hourly?.time, hi);
  const sl = (arr, start, n = 12) => (arr || []).slice(start, start + n);
  return {
    waveHeight:  marineJson.hourly.wave_height?.[hi]          ?? 0,
    wavePeriod:  marineJson.hourly.wave_period?.[hi]          ?? 0,
    waveDir:     marineJson.hourly.wave_direction?.[hi]        ?? 0,
    swellHeight: marineJson.hourly.swell_wave_height?.[hi]    ?? 0,
    swellPeriod: marineJson.hourly.swell_wave_period?.[hi]    ?? 0,
    swellDir:    marineJson.hourly.swell_wave_direction?.[hi] ?? 0,
    windSpeed:   windJson?.hourly?.wind_speed_10m?.[wi]       ?? 0,
    windDir:     windJson?.hourly?.wind_direction_10m?.[wi]   ?? 0,
    times:       sl(marineJson.hourly.time, hi),
    forecastWave: sl(marineJson.hourly.wave_height, hi),
    forecastWind: sl(windJson?.hourly?.wind_speed_10m, wi),
  };
};

const fetchSpotCondition = async spot => {
  try {
    const marine = await fetchMarine(spot.lat, spot.lon).catch(() => null);
    if (!marine?.hourly) return null;
    const lat = marine?.latitude ?? spot.lat;
    const lon = marine?.longitude ?? spot.lon;
    const wind = await fetchWind(lat, lon).catch(() => null);
    return buildSpotCondition(spot, marine, wind);
  } catch {
    return null;
  }
};

const fetchMissingSpotData = async (spots, existingSpotData = {}) => {
  const missing = spots.filter(s => !existingSpotData[s.id]);
  if (!missing.length) return {};
  const pairs = await Promise.all(
    missing.map(async spot => [spot.id, await fetchSpotCondition(spot)])
  );
  return Object.fromEntries(pairs.filter(([, v]) => !!v));
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function Sparkline({ data, color = THEME.accent, height = 48 }) {
  if (!data?.length) return <svg width="100%" height={height} />;
  const W = 300;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = height - ((v - min) / range) * (height - 6) - 3;
    return [x, y];
  });
  let path = `M ${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const cx = (x0 + x1) / 2;
    path += ` C ${cx},${y0} ${cx},${y1} ${x1},${y1}`;
  }
  const fill = path + ` L ${W},${height} L 0,${height} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} style={{ width: "100%", height }}>
      <defs>
        <linearGradient id={`sg-${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={fill} fill={`url(#sg-${color.replace("#","")})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Min/max labels */}
      <text x={pts[data.indexOf(max)][0]} y={pts[data.indexOf(max)][1] - 4}
        textAnchor="middle" fontSize="8" fill={color} opacity="0.8">{fmtFt(max)}ft</text>
    </svg>
  );
}

function TideChart({ tides }) {
  if (!tides?.length) return <p style={{ color: THEME.textSoft, fontSize: 12 }}>No tide data available.</p>;
  const vals = tides.map(t => parseFloat(t.v));
  const min = Math.min(...vals) - 0.3;
  const max = Math.max(...vals) + 0.3;
  const W = 400, H = 72;
  const pts = tides.map((t, i) => {
    const x = tides.length <= 1 ? W / 2 : (i / (tides.length - 1)) * W;
    const y = H - ((parseFloat(t.v) - min) / (max - min)) * (H - 8) - 4;
    return [x, y];
  });
  let path = `M ${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const cx = (x0 + x1) / 2;
    path += ` C ${cx},${y0} ${cx},${y1} ${x1},${y1}`;
  }
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H }}>
        <defs>
          <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={THEME.accent} stopOpacity="0.3" />
            <stop offset="100%" stopColor={THEME.accent} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={path + ` L ${W},${H} L 0,${H} Z`} fill="url(#tg)" />
        <path d={path} fill="none" stroke={THEME.accent} strokeWidth="1.5" />
        {pts.map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r="3" fill={THEME.accent} />
            <text x={x} y={y - 6} textAnchor="middle" fontSize="8" fill={THEME.textSoft}>
              {tides[i].type === "H" ? "▲" : "▼"} {parseFloat(tides[i].v).toFixed(1)}ft
            </text>
          </g>
        ))}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: THEME.textSoft, marginTop: 2, fontFamily: "'Space Mono', monospace" }}>
        {tides.map((t, i) => <span key={i}>{t.t.slice(11, 16)}</span>)}
      </div>
    </div>
  );
}

function WindCompass({ deg, speed }) {
  const r = 22;
  const rad = (deg - 90) * Math.PI / 180;
  const x2 = 28 + r * Math.cos(rad);
  const y2 = 28 + r * Math.sin(rad);
  return (
    <svg width="56" height="56">
      <circle cx="28" cy="28" r="26" fill="none" stroke={THEME.border} strokeWidth="1" />
      {["N","E","S","W"].map((d, i) => {
        const a = i * 90 * Math.PI / 180;
        return <text key={d} x={28 + 20 * Math.cos(a - Math.PI/2)} y={28 + 20 * Math.sin(a - Math.PI/2) + 3}
          textAnchor="middle" fontSize="7" fill={THEME.textSoft}>{d}</text>;
      })}
      <line x1="28" y1="28" x2={x2} y2={y2} stroke={THEME.accent} strokeWidth="2" strokeLinecap="round" />
      <circle cx="28" cy="28" r="2.5" fill={THEME.accent} />
      <text x="28" y="50" textAnchor="middle" fontSize="7" fill={THEME.textSoft} fontFamily="'Space Mono',monospace">{speed?.toFixed(0)}mph</text>
    </svg>
  );
}

// ─── Screens ─────────────────────────────────────────────────────────────────

function SetupScreen({
  skill,
  setSkill,
  quiver,
  toggleBoard,
  customBoard,
  setCustomBoard,
  driveOrigin,
  setDriveOrigin,
  driveOriginStatus,
  driveOriginOptions,
  driveOriginOptionsLoading,
  showDriveOriginOptions,
  onDriveOriginFocus,
  onDriveOriginSelect,
  onDriveOriginBlur,
  onSubmit,
}) {
  return (
    <div style={{
      height: "100vh",
      backgroundImage: POSTCARD_BG,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      backgroundAttachment: "fixed",
      padding: "18px 20px",
      fontFamily: "'Inter', sans-serif",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      overflow: "hidden",
    }}>
      <style>{FONTS}</style>
      <div style={{ textAlign: "center", marginBottom: 22 }}>
        <div style={{ letterSpacing: 8, fontSize: 9, color: THEME.accent, marginBottom: 10 }}>BAY AREA</div>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 40, color: THEME.textStrong, margin: 0, fontWeight: 700, letterSpacing: -0.6, lineHeight: 1 }}>
          SURF INTEL
        </h1>
        <p style={{ color: THEME.textSoft, fontSize: 12, marginTop: 6, letterSpacing: 0.8 }}>
          Live swell · NOAA tides · AI coaching
        </p>
      </div>

      <div style={{ maxWidth: 680, width: "100%", margin: "0 auto" }}>

        {/* Skill */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 8, letterSpacing: 3, color: THEME.accent, marginBottom: 8 }}>YOUR SKILL LEVEL</div>
          <div style={{ display: "flex", gap: 8 }}>
            {SKILLS.map(s => (
              <button key={s} onClick={() => setSkill(s)} style={{
                flex: 1, padding: "9px 0",
                border: skill === s ? `1px solid ${THEME.accent}` : `1px solid ${THEME.border}`,
                background: skill === s ? THEME.accentSoft : THEME.panel,
                color: skill === s ? THEME.accent : THEME.text,
                borderRadius: 6, fontSize: 11, cursor: "pointer", fontFamily: "'Space Mono', monospace",
                transition: "all 0.15s",
              }}>{s}</button>
            ))}
          </div>
        </div>

        {/* Quiver */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 8, letterSpacing: 3, color: THEME.accent, marginBottom: 8 }}>
            YOUR QUIVER <span style={{ color: THEME.textSoft, letterSpacing: 0, fontFamily: "'Inter', sans-serif", fontSize: 9 }}>— select all you own</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {BOARDS.map(b => {
              const sel = quiver.includes(b.id);
              return (
                <button key={b.id} onClick={() => toggleBoard(b.id)} style={{
                  padding: "10px 10px", textAlign: "left",
                  border: sel ? `1px solid ${THEME.accent}` : `1px solid ${THEME.border}`,
                  background: sel ? THEME.accentSoft : THEME.panel,
                  borderRadius: 8, cursor: "pointer", transition: "all 0.15s",
                }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: sel ? THEME.accent : THEME.text, marginBottom: 2 }}>{b.name}</div>
                  <div style={{ fontSize: 9, color: sel ? "#3a9f95" : THEME.textSoft, fontFamily: "'Space Mono', monospace" }}>{b.size}</div>
                  <div style={{ fontSize: 9, color: THEME.muted, marginTop: 2 }}>{b.desc}</div>
                </button>
              );
            })}
          </div>
          <input
            value={customBoard} onChange={e => setCustomBoard(e.target.value)}
            placeholder={"+ Custom board (e.g. 6'8\" step-up twin)"}
            style={{
              width: "100%", marginTop: 7, padding: "9px 12px", boxSizing: "border-box",
              background: THEME.panel, border: `1px solid ${THEME.border}`,
              borderRadius: 6, color: THEME.text, fontSize: 11, outline: "none",
              fontFamily: "'Space Mono', monospace",
            }}
          />
        </div>

        {/* Drive origin */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 8, letterSpacing: 3, color: THEME.accent, marginBottom: 6 }}>
            YOUR START LOCATION
          </div>
          <input
            value={driveOrigin}
            onChange={e => setDriveOrigin(e.target.value)}
            onFocus={onDriveOriginFocus}
            onBlur={onDriveOriginBlur}
            placeholder={"Enter address or lat,lon (e.g. 37.7749,-122.4194)"}
            style={{
              width: "100%", padding: "9px 12px", boxSizing: "border-box",
              background: THEME.panel, border: `1px solid ${THEME.border}`,
              borderRadius: 6, color: THEME.text, fontSize: 11, outline: "none",
              fontFamily: "'Space Mono', monospace",
            }}
          />
          {showDriveOriginOptions && (
            <div style={{
              marginTop: 6,
              border: `1px solid ${THEME.border}`,
              borderRadius: 6,
              overflow: "hidden",
              background: "rgba(255,255,255,0.95)",
              maxHeight: 120,
              overflowY: "auto",
            }}>
              {driveOriginOptionsLoading ? (
                <div style={{ fontSize: 11, color: THEME.textSoft, padding: "10px 12px" }}>Searching locations...</div>
              ) : driveOriginOptions.length ? (
                driveOriginOptions.map((opt, i) => (
                  <button
                    key={`${opt.label}-${i}`}
                    onMouseDown={e => {
                      e.preventDefault();
                      onDriveOriginSelect(opt);
                    }}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 12px",
                      border: "none",
                      borderBottom: i === driveOriginOptions.length - 1 ? "none" : `1px solid ${THEME.border}`,
                      background: "transparent",
                      color: THEME.text,
                      fontSize: 11,
                      cursor: "pointer",
                      fontFamily: "'Inter', sans-serif",
                    }}
                  >
                    {opt.label}
                  </button>
                ))
              ) : (
                <div style={{ fontSize: 11, color: THEME.textSoft, padding: "10px 12px" }}>No matches yet.</div>
              )}
            </div>
          )}
          <div style={{ fontSize: 9, color: THEME.textSoft, marginTop: 5 }}>{driveOriginStatus || "Drive times will be calculated from this location."}</div>
        </div>

        <button onClick={onSubmit} style={{
          width: "100%", padding: "13px 0", background: THEME.accent, border: "none",
          borderRadius: 8, color: "#ffffff", fontSize: 11, fontWeight: 700,
          letterSpacing: 3, cursor: "pointer", fontFamily: "'Space Mono', monospace",
          transition: "opacity 0.15s",
        }}>FETCH CONDITIONS →</button>

        <p style={{ textAlign: "center", fontSize: 9, color: THEME.textSoft, marginTop: 10, letterSpacing: 0.8 }}>
          Open-Meteo Marine API · NOAA CO-OPS (nearest station per spot) · Claude AI
        </p>
      </div>
    </div>
  );
}

function LoadingScreen({ spotCount }) {
  const [dots, setDots] = useState(".");
  useEffect(() => {
    const id = setInterval(() => setDots(d => d.length >= 3 ? "." : d + "."), 380);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={{
      minHeight: "100vh",
      backgroundImage: POSTCARD_BG,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      backgroundAttachment: "fixed",
      display: "flex",
      flexDirection: "column", alignItems: "center", justifyContent: "center",
    }}>
      <style>{FONTS}</style>
      {/* Animated wave rings */}
      <div style={{ position: "relative", width: 80, height: 80, marginBottom: 32 }}>
        {[0,1,2].map(i => (
          <div key={i} style={{
            position: "absolute", inset: 0, borderRadius: "50%",
            border: "1px solid rgba(43,183,167,0.35)",
            animation: `pulse 2s ${i * 0.6}s ease-out infinite`,
          }} />
        ))}
        <div style={{
          position: "absolute", inset: 20, borderRadius: "50%",
          background: "rgba(43,183,167,0.18)", display: "flex",
          alignItems: "center", justifyContent: "center", fontSize: 20,
        }}>🌊</div>
      </div>
      <style>{`@keyframes pulse { 0%{transform:scale(1);opacity:0.8} 100%{transform:scale(2.2);opacity:0} }`}</style>
      <div style={{ fontSize: 11, color: THEME.accent, letterSpacing: 4, fontFamily: "'Space Mono', monospace" }}>
        READING THE OCEAN{dots}
      </div>
      <div style={{ fontSize: 11, color: THEME.textSoft, marginTop: 10, fontFamily: "'Inter', sans-serif" }}>
        Fetching swell, tides & wind data for {spotCount} spots
      </div>
    </div>
  );
}

function Dashboard({
  spots,
  spotData,
  driveTimes,
  activeSpot,
  setActiveSpot,
  tidesByStation,
  aiRec,
  skill,
  quiver,
  onRefresh,
  addSpotOpen,
  setAddSpotOpen,
  addSpotName,
  setAddSpotName,
  addSpotStatus,
  addSpotLoading,
  onAddSpot,
}) {
  const data = spotData[activeSpot.id];
  const spotTides = tidesByStation[activeSpot.tideStationId] || [];
  const rating = data ? getRating(data.waveHeight, data.wavePeriod) : null;

  const formatAI = text =>
    text.replace(/\*\*(.*?)\*\*/g, `<strong style="color:${THEME.accent}">$1</strong>`)
        .replace(/\n\n/g, "</p><p style='margin:8px 0'>")
        .replace(/\n/g, "<br/>");

  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

  return (
    <div style={{
      height: "100vh",
      backgroundImage: POSTCARD_BG,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      backgroundAttachment: "fixed",
      color: THEME.text,
      fontFamily: "'Inter', sans-serif",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>
      <style>{FONTS}</style>

      {/* ── Top bar ── */}
      <div style={{
        padding: "0 24px", height: 52, display: "flex", alignItems: "center",
        justifyContent: "space-between", borderBottom: `1px solid ${THEME.border}`, flexShrink: 0,
        background: "rgba(255,255,255,0.72)", backdropFilter: "blur(4px)",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, color: THEME.textStrong }}>SURF INTEL</span>
          <span style={{ fontSize: 9, letterSpacing: 3, color: THEME.textSoft }}>BAY AREA</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <span style={{ fontSize: 10, color: THEME.textSoft, fontFamily: "'Space Mono', monospace" }}>{dateStr} · {timeStr}</span>
          <span style={{ fontSize: 10, color: THEME.textSoft }}>{skill} · {quiver.length} boards</span>
          <button onClick={onRefresh} style={{
            padding: "5px 13px", background: THEME.panel, border: `1px solid ${THEME.border}`,
            borderRadius: 4, color: THEME.text, fontSize: 10, cursor: "pointer",
            fontFamily: "'Space Mono', monospace", letterSpacing: 1, transition: "all 0.15s",
          }}>↻ REFRESH AI</button>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* ── Spot sidebar ── */}
        <div style={{
          width: 188,
          borderRight: `1px solid ${THEME.border}`,
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          background: "rgba(255,255,255,0.6)",
          backdropFilter: "blur(3px)",
        }}>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {spots.map(spot => {
              const d = spotData[spot.id];
              const r = d ? getRating(d.waveHeight, d.wavePeriod) : null;
              const drive = driveTimes[spot.id];
              const active = spot.id === activeSpot.id;
              return (
                <div key={spot.id} onClick={() => setActiveSpot(spot)} style={{
                  padding: "13px 16px", cursor: "pointer",
                  borderBottom: `1px solid ${THEME.border}`,
                  borderLeft: active ? `2px solid ${THEME.accent}` : "2px solid transparent",
                  background: active ? THEME.accentSoft : "transparent",
                  transition: "all 0.1s",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: active ? THEME.textStrong : THEME.textSoft }}>{spot.shortName}</div>
                    {r && (
                      <div style={{
                        fontSize: 11,
                        color: getRatingDisplayColor(r.label),
                        fontFamily: "'Space Mono', monospace",
                        fontWeight: 700,
                        letterSpacing: 0.8,
                        lineHeight: 1,
                      }}>
                        {r.label}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 9, color: THEME.muted, marginBottom: 5 }}>{spot.type} · {spot.city}</div>
                  {d ? (
                    <>
                      <div style={{ fontSize: 11, color: THEME.text, fontFamily: "'Space Mono', monospace" }}>
                        {fmtFt(d.waveHeight)}ft @ {d.wavePeriod?.toFixed(0)}s
                      </div>
                      <div style={{ fontSize: 10, color: THEME.textSoft, fontFamily: "'Space Mono', monospace", marginTop: 4 }}>
                        {drive ? `${drive} drive` : "Drive time —"}
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: 10, color: "#1a2a3a" }}>—</div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ borderTop: `1px solid ${THEME.border}`, padding: 10 }}>
            {addSpotOpen ? (
              <div>
                <input
                  value={addSpotName}
                  onChange={e => setAddSpotName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") onAddSpot();
                  }}
                  placeholder="Surf spot (ZIP via Claude, then map)"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "7px 8px",
                    borderRadius: 6,
                    border: `1px solid ${THEME.border}`,
                    fontSize: 10,
                    color: THEME.text,
                    fontFamily: "'Space Mono', monospace",
                    marginBottom: 6,
                    background: THEME.panel,
                  }}
                />
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={onAddSpot}
                    disabled={addSpotLoading}
                    style={{
                      flex: 1,
                      padding: "7px 0",
                      borderRadius: 6,
                      border: "none",
                      background: THEME.accent,
                      color: "#fff",
                      fontSize: 9,
                      letterSpacing: 1,
                      cursor: addSpotLoading ? "default" : "pointer",
                      fontFamily: "'Space Mono', monospace",
                      opacity: addSpotLoading ? 0.75 : 1,
                    }}
                  >
                    {addSpotLoading ? "ADDING..." : "ADD"}
                  </button>
                  <button
                    onClick={() => {
                      setAddSpotOpen(false);
                      setAddSpotName("");
                    }}
                    disabled={addSpotLoading}
                    style={{
                      flex: 1,
                      padding: "7px 0",
                      borderRadius: 6,
                      border: `1px solid ${THEME.border}`,
                      background: THEME.panel,
                      color: THEME.textSoft,
                      fontSize: 9,
                      letterSpacing: 1,
                      cursor: addSpotLoading ? "default" : "pointer",
                      fontFamily: "'Space Mono', monospace",
                    }}
                  >
                    CANCEL
                  </button>
                </div>
                {addSpotStatus && (
                  <div style={{ fontSize: 9, color: THEME.textSoft, marginTop: 6, lineHeight: 1.35 }}>
                    {addSpotStatus}
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => setAddSpotOpen(true)}
                style={{
                  width: "100%",
                  padding: "8px 0",
                  borderRadius: 6,
                  border: `1px dashed ${THEME.accent}`,
                  background: THEME.accentSoft,
                  color: THEME.accent,
                  fontSize: 9,
                  letterSpacing: 1.2,
                  cursor: "pointer",
                  fontFamily: "'Space Mono', monospace",
                }}
              >
                + ADD SPOT
              </button>
            )}
          </div>
        </div>

        {/* ── Main panel ── */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          padding: 24,
          background: "rgba(249,253,255,0.42)",
          backdropFilter: "blur(2px)",
        }}>
          {data ? (
            <>
              {/* Spot header */}
              <div style={{ marginBottom: 22 }}>
                <div style={{ fontSize: 9, letterSpacing: 3, color: THEME.textSoft, marginBottom: 6 }}>
                  {activeSpot.city.toUpperCase()} · {activeSpot.type.toUpperCase()} · {activeSpot.difficulty.toUpperCase()}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                  <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, margin: 0, color: THEME.textStrong }}>
                    {activeSpot.name}
                  </h2>
                  <div style={{
                    fontSize: 10, color: rating?.color, fontFamily: "'Space Mono', monospace",
                    fontWeight: 700, letterSpacing: 3, border: `1px solid ${rating?.color}20`,
                    padding: "4px 12px", borderRadius: 3, background: `${rating?.color}10`,
                  }}>{rating?.label}</div>
                  <div style={{ fontSize: 10, color: THEME.textSoft, fontFamily: "'Space Mono', monospace", letterSpacing: 1.5 }}>
                    {driveTimes[activeSpot.id] ? `${driveTimes[activeSpot.id]} DRIVE` : "DRIVE TIME —"}
                  </div>
                </div>
              </div>

              {/* Stat cards */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
                {[
                  { label: "WAVE HEIGHT", value: `${fmtFt(data.waveHeight)}ft`, sub: `${fmtFt(data.swellHeight)}ft swell face` },
                  { label: "PERIOD", value: `${data.wavePeriod?.toFixed(0)}s`, sub: `${data.swellPeriod?.toFixed(0)}s swell period` },
                  { label: "SWELL DIR", value: degToCompass(data.swellDir), sub: `${Math.round(data.swellDir || 0)}° bearing` },
                  { label: "WIND", value: `${data.windSpeed?.toFixed(0)}mph`, sub: `from ${degToCompass(data.windDir)}` },
                ].map(c => (
                  <div key={c.label} style={{ background: THEME.panel, borderRadius: 8, padding: "13px 14px", border: `1px solid ${THEME.border}` }}>
                    <div style={{ fontSize: 8, letterSpacing: 3, color: THEME.muted, marginBottom: 8 }}>{c.label}</div>
                    <div style={{ fontSize: 20, fontFamily: "'Space Mono', monospace", color: THEME.accent, fontWeight: 700, lineHeight: 1 }}>{c.value}</div>
                    <div style={{ fontSize: 10, color: THEME.textSoft, marginTop: 5 }}>{c.sub}</div>
                  </div>
                ))}
              </div>

              {/* Wind compass + 12hr forecast */}
              <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 10, marginBottom: 16 }}>
                <div style={{ background: THEME.panel, borderRadius: 8, padding: "13px", border: `1px solid ${THEME.border}`, display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div style={{ fontSize: 8, letterSpacing: 2, color: THEME.muted, marginBottom: 6 }}>WIND</div>
                  <WindCompass deg={data.windDir} speed={data.windSpeed} />
                </div>
                <div style={{ background: THEME.panel, borderRadius: 8, padding: "13px 16px", border: `1px solid ${THEME.border}` }}>
                  <div style={{ fontSize: 8, letterSpacing: 3, color: THEME.muted, marginBottom: 8 }}>12-HR WAVE FORECAST</div>
                  <Sparkline data={data.forecastWave} color={THEME.accent} height={48} />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: THEME.textSoft, marginTop: 2, fontFamily: "'Space Mono', monospace" }}>
                    {(data.times || []).filter((_, i) => i % 3 === 0).slice(0, 4).map((t, i) => (
                      <span key={i}>{t?.slice(11, 16) || "—"}</span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Tides */}
              <div style={{ background: THEME.panel, borderRadius: 8, padding: "13px 16px", border: `1px solid ${THEME.border}` }}>
                <div style={{ fontSize: 8, letterSpacing: 3, color: THEME.muted, marginBottom: 10 }}>
                  TIDES — NOAA {activeSpot.tideStationId} · {activeSpot.tideStationLabel}
                </div>
                <TideChart tides={spotTides} />
              </div>
            </>
          ) : (
            <div style={{ padding: 40, textAlign: "center", color: THEME.textSoft, fontSize: 13 }}>
              No data for this spot — check your connection.
            </div>
          )}
        </div>

        {/* ── AI Panel ── */}
        <div style={{
          width: 292, borderLeft: `1px solid ${THEME.border}`, padding: "20px 18px",
          overflowY: "auto", flexShrink: 0, background: THEME.panelAlt,
        }}>
          <div style={{ fontSize: 8, letterSpacing: 4, color: THEME.accent, marginBottom: 16 }}>AI RECOMMENDATION</div>

          {aiRec.loading ? (
            <div>
              <div style={{ fontSize: 11, color: THEME.textSoft, marginBottom: 6 }}>Showing AI recommendation…</div>
              {aiRec.retryAttempt > 1 && (
                <div style={{ fontSize: 10, color: THEME.muted, marginBottom: 12, fontFamily: "'Space Mono', monospace" }}>
                  Retrying AI recommendation ({aiRec.retryAttempt}/{aiRec.maxAttempts})…
                </div>
              )}
              {[100, 80, 90, 70, 85].map((w, i) => (
                <div key={i} style={{
                  height: 10, background: "#d5edf4", borderRadius: 3, marginBottom: 8,
                  width: `${w}%`, animation: "shimmer 1.5s infinite",
                }} />
              ))}
              <style>{`@keyframes shimmer{0%,100%{opacity:0.4}50%{opacity:1}}`}</style>
            </div>
          ) : aiRec.text ? (
            <div
              style={{ fontSize: 12.5, lineHeight: 1.75, color: THEME.text }}
              dangerouslySetInnerHTML={{ __html: `<p style='margin:0'>${formatAI(aiRec.text)}</p>` }}
            />
          ) : (
            <div style={{ fontSize: 12, color: THEME.textSoft }}>
              Fetch conditions to get your AI recommendation.
            </div>
          )}

          {/* Divider + legend */}
          <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${THEME.border}` }}>
            <div style={{ fontSize: 8, letterSpacing: 3, color: THEME.textSoft, marginBottom: 12 }}>CONDITION KEY</div>
            {[
              { label: "EPIC", color: "#ff8c42", desc: "Long period, overhead+" },
              { label: "SOLID", color: "#0eb8a0", desc: "Clean, fun-sized surf" },
              { label: "FUN",  color: "#0eb8a0", desc: "Waist–chest high, clean" },
              { label: "WEAK", color: "#5a7a9a", desc: "Mushy, short period" },
              { label: "SMALL", color: "#3a5570", desc: "Knee high or less" },
            ].map(r => (
              <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                <span style={{ fontSize: 8, color: r.color, fontFamily: "'Space Mono', monospace", fontWeight: 700, minWidth: 46 }}>{r.label}</span>
                <span style={{ fontSize: 10, color: THEME.textSoft }}>{r.desc}</span>
              </div>
            ))}
          </div>

          {/* Data credits */}
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${THEME.border}` }}>
            <div style={{ fontSize: 8, letterSpacing: 3, color: THEME.muted, marginBottom: 8 }}>DATA SOURCES</div>
            {[
              "Open-Meteo Marine API",
              "Open-Meteo Forecast API",
              "NOAA CO-OPS Tides",
              "TomTom Routing API",
              "Anthropic Claude Sonnet",
            ].map(s => (
              <div key={s} style={{ fontSize: 9, color: THEME.muted, marginBottom: 4 }}>· {s}</div>
            ))}
            <div style={{ fontSize: 9, color: THEME.textSoft, marginTop: 12, lineHeight: 1.55 }}>
              Swell and wind are <strong style={{ color: THEME.text }}>weather-model forecasts</strong> (not buoy readings).
              Heights are offshore-style estimates and often differ from a given break after shoaling and local wind.
              Tide highs/lows are NOAA CO-OPS predictions for the station shown for the selected spot; each break uses the nearest applicable prediction station.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState("setup");
  const [skill, setSkill] = useState("Intermediate");
  const [quiver, setQuiver] = useState(["longboard", "shortboard"]);
  const [customBoard, setCustomBoard] = useState("");
  const [driveOrigin, setDriveOrigin] = useState((import.meta.env.VITE_DRIVE_ORIGIN || "San Francisco, CA").trim());
  const [driveOriginResolved, setDriveOriginResolved] = useState(null);
  const [driveOriginStatus, setDriveOriginStatus] = useState("");
  const [driveOriginOptions, setDriveOriginOptions] = useState([]);
  const [driveOriginOptionsLoading, setDriveOriginOptionsLoading] = useState(false);
  const [showDriveOriginOptions, setShowDriveOriginOptions] = useState(false);
  const [spots, setSpots] = useState(SPOTS);
  const [spotData, setSpotData] = useState({});
  const [driveTimes, setDriveTimes] = useState({});
  const [spotRetryTick, setSpotRetryTick] = useState(0);
  const [tidesByStation, setTidesByStation] = useState({});
  const [activeSpot, setActiveSpot] = useState(SPOTS[0]);
  const [aiRec, setAiRec] = useState({ text: "", loading: false, retryAttempt: 1, maxAttempts: 1 });
  const [driveRetryTick, setDriveRetryTick] = useState(0);
  const [addSpotOpen, setAddSpotOpen] = useState(false);
  const [addSpotName, setAddSpotName] = useState("");
  const [addSpotStatus, setAddSpotStatus] = useState("");
  const [addSpotLoading, setAddSpotLoading] = useState(false);

  const toggleBoard = id => setQuiver(q => q.includes(id) ? q.filter(x => x !== id) : [...q, id]);

  const resolveAndAutofillDriveOrigin = async () => {
    const apiKey = (import.meta.env.VITE_TOMTOM_API_KEY || "").trim();
    const raw = driveOrigin.trim();
    if (!raw || !apiKey) return null;
    setDriveOriginStatus("Resolving location...");
    const resolved = await resolveTomTomLocation(raw, apiKey);
    if (!resolved) {
      setDriveOriginResolved(null);
      setDriveOriginStatus("Could not validate location. Try a fuller address.");
      return null;
    }
    setDriveOriginResolved({ lat: resolved.lat, lon: resolved.lon });
    if (resolved.label && resolved.label !== raw) setDriveOrigin(resolved.label);
    setDriveOriginStatus(`Using: ${resolved.label}`);
    return resolved;
  };

  const handleDriveOriginSelect = opt => {
    setDriveOrigin(opt.label);
    setDriveOriginResolved({ lat: opt.lat, lon: opt.lon });
    setDriveOriginStatus(`Using: ${opt.label}`);
    setShowDriveOriginOptions(false);
  };

  useEffect(() => {
    if (screen !== "setup") return;
    const apiKey = (import.meta.env.VITE_TOMTOM_API_KEY || "").trim();
    const q = driveOrigin.trim();
    if (!showDriveOriginOptions || !apiKey || q.length < 2) {
      setDriveOriginOptions([]);
      setDriveOriginOptionsLoading(false);
      return;
    }

    setDriveOriginOptionsLoading(true);
    const timer = setTimeout(async () => {
      const opts = await fetchTomTomLocationOptions(q, apiKey);
      setDriveOriginOptions(opts);
      setDriveOriginOptionsLoading(false);
    }, 250);

    return () => clearTimeout(timer);
  }, [driveOrigin, showDriveOriginOptions, screen]);

  const callAI = async (data, tideData, spotsForAi = spots) => {
    setAiRec({ text: "", loading: true, retryAttempt: 1, maxAttempts: 1 });

    const quiverDesc = [
      ...quiver.map(id => BOARDS.find(b => b.id === id)?.name || id),
      ...(customBoard.trim() ? [customBoard.trim()] : []),
    ].join(", ") || "unspecified";

    const condLines = spotsForAi.map(s => {
      const d = data[s.id];
      if (!d) return `${s.name}: no data`;
      return `${s.name} (${s.type}, ${s.difficulty}): ${fmtFt(d.waveHeight)}ft @ ${d.wavePeriod?.toFixed(0)}s, swell ${fmtFt(d.swellHeight)}ft from ${degToCompass(d.swellDir)}, wind ${d.windSpeed?.toFixed(0)}mph from ${degToCompass(d.windDir)}`;
    }).join("\n");

    const tideBlock = spotsForAi.map(s => {
      const preds = tideData?.[s.tideStationId] || [];
      const line = preds.slice(0, 8)
        .map(t => `${t.t}: ${t.type === "H" ? "High" : "Low"} ${parseFloat(t.v).toFixed(1)}ft`)
        .join(", ");
      return `${s.name} — NOAA ${s.tideStationId} (${s.tideStationLabel}): ${line || "no predictions"}`;
    }).join("\n");

    const anthropicUrl = getAnthropicMessagesUrl();
    const primaryModel = (import.meta.env.VITE_ANTHROPIC_MODEL || "claude-haiku-4-5-20251001").trim();
    const fallbackModel = (import.meta.env.VITE_ANTHROPIC_FALLBACK_MODEL || "claude-sonnet-4-6").trim();
    const modelChain = [...new Set([primaryModel, fallbackModel].filter(Boolean))];
    const maxAttempts = 3;
    setAiRec({ text: "", loading: true, retryAttempt: 1, maxAttempts });

    try {
      let lastErr = "Unknown AI error";
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        setAiRec(prev => ({ ...prev, loading: true, retryAttempt: attempt, maxAttempts }));
        for (const model of modelChain) {
          const res = await fetch(anthropicUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model,
              max_tokens: 1000,
              messages: [{
                role: "user",
                content: `You are an expert Bay Area surf coach giving a concise, direct session recommendation. Use real surf lingo.

CURRENT CONDITIONS:
${condLines}

TIDES (nearest NOAA station per spot, next events):
${tideBlock}

SURFER: ${skill} level. Quiver: ${quiverDesc}

Provide a recommendation covering exactly these 5 points, each on its own paragraph:
**Best Spot** — name the spot and give the specific reason based on today's numbers.
**Best Window** — exact time range today, grounded in the tide schedule and swell trend.
**Board Pick** — which board from their quiver to grab, and the technical reason why.
**In the Water** — what to expect: crowds, hazards, vibe. 2–3 sentences.
**Local Tip** — one insider tip that only a regular at that spot would know.

Max 230 words. No preamble or sign-off. Start directly with **Best Spot**.`,
              }],
            }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) {
            lastErr = json.error?.message || json.message || `HTTP ${res.status}`;
            continue;
          }
          const text = json.content?.find(b => b.type === "text")?.text || "No recommendation available.";
          setAiRec({ text, loading: false, retryAttempt: attempt, maxAttempts });
          return;
        }
        if (attempt < maxAttempts && isLikelyTransientAiError(lastErr)) {
          await sleep(750 * attempt);
          continue;
        }
        break;
      }
      setAiRec({ text: `AI error: ${lastErr}`, loading: false, retryAttempt: maxAttempts, maxAttempts });
    } catch {
      setAiRec({ text: "Could not reach AI. Check your connection and try refreshing.", loading: false, retryAttempt: maxAttempts, maxAttempts });
    }
  };

  const loadData = async () => {
    setScreen("loading");
    try {
      const marines = await Promise.all(spots.map(s => fetchMarine(s.lat, s.lon).catch(() => null)));
      const winds = await Promise.all(
        marines.map((m, i) => {
          const lat = m?.latitude ?? spots[i].lat;
          const lon = m?.longitude ?? spots[i].lon;
          return fetchWind(lat, lon).catch(() => null);
        })
      );
      const uniqueTideIds = [...new Set(spots.map(s => s.tideStationId))];
      const tideJsons = await Promise.all(
        uniqueTideIds.map(id => fetchTides(id).catch(() => ({ predictions: [] })))
      );
      const resolved = driveOriginResolved || await resolveAndAutofillDriveOrigin();
      const originForRouting = resolved ? `${resolved.lat},${resolved.lon}` : driveOrigin;
      const nextDriveTimes = await fetchDriveTimes(spots, originForRouting);
      const nextTidesByStation = {};
      uniqueTideIds.forEach((id, i) => {
        nextTidesByStation[id] = tideJsons[i]?.predictions || [];
      });

      const data = {};
      spots.forEach((spot, i) => {
        data[spot.id] = buildSpotCondition(spot, marines[i], winds[i]);
      });

      setSpotData(data);
      setSpotRetryTick(0);
      setDriveTimes(nextDriveTimes);
      setDriveRetryTick(0);
      setTidesByStation(nextTidesByStation);
      setScreen("dashboard");
      callAI(data, nextTidesByStation, spots);
    } catch (err) {
      console.error(err);
      setScreen("dashboard");
    }
  };

  const handleAddSpot = async () => {
    const name = addSpotName.trim();
    if (!name) {
      setAddSpotStatus("Enter a spot name.");
      return;
    }
    const apiKey = (import.meta.env.VITE_TOMTOM_API_KEY || "").trim();
    if (!apiKey) {
      setAddSpotStatus("TomTom API key is missing. Add VITE_TOMTOM_API_KEY to map the ZIP to coordinates.");
      return;
    }

    setAddSpotLoading(true);
    setAddSpotStatus("Looking up ZIP (Claude)…");
    try {
      const regionHint = (driveOrigin.trim() || "San Francisco Bay Area, California, USA");
      const zipPayload = await fetchSurfSpotZipFromAnthropic(name, regionHint);
      if (!zipPayload?.zip) {
        setAddSpotStatus("Could not get a US ZIP for that spot. Try a more specific name (e.g. “Steamer Lane, Santa Cruz”).");
        return;
      }

      setAddSpotStatus(`ZIP ${zipPayload.zip} — mapping…`);
      const resolved = await geocodeUsZipWithTomTom(zipPayload.zip, apiKey);
      if (!resolved) {
        setAddSpotStatus(`Could not geocode ZIP ${zipPayload.zip}. Check your TomTom key.`);
        return;
      }

      const dupByName = spots.some(s =>
        normalizeSpotName(s.name) === normalizeSpotName(name)
      );
      const dupByCoords = spots.some(s =>
        Math.abs((s.lat || 0) - resolved.lat) < 0.01 && Math.abs((s.lon || 0) - resolved.lon) < 0.01
      );
      if (dupByName || dupByCoords) {
        setAddSpotStatus("That spot already exists in your list.");
        return;
      }

      const cityDisplay = zipPayload.place
        ? deriveCityFromPlaceOrLabel(zipPayload.place)
        : deriveCityFromPlaceOrLabel(resolved.label);
      const tideMeta = getNearestTideStationMeta(resolved.lat, resolved.lon);
      const nextSpot = {
        id: createSpotId(name),
        name,
        shortName: name.length > 18 ? `${name.slice(0, 18)}…` : name,
        lat: resolved.lat,
        lon: resolved.lon,
        type: normalizeBreakType(zipPayload.type),
        difficulty: normalizeSpotDifficulty(zipPayload.difficulty),
        city: cityDisplay,
        tideStationId: tideMeta.tideStationId,
        tideStationLabel: tideMeta.tideStationLabel,
      };
      const nextSpots = [...spots, nextSpot];

      setSpots(nextSpots);
      setActiveSpot(nextSpot);
      setAddSpotStatus(`Added ${nextSpot.name}. Fetching conditions...`);

      const condition = await fetchSpotCondition(nextSpot);
      if (condition) {
        setSpotData(prev => ({ ...prev, [nextSpot.id]: condition }));
      }

      const originForRouting = driveOriginResolved
        ? `${driveOriginResolved.lat},${driveOriginResolved.lon}`
        : driveOrigin;
      const drive = await fetchDriveTimes([nextSpot], originForRouting);
      if (drive?.[nextSpot.id]) {
        setDriveTimes(prev => ({ ...prev, [nextSpot.id]: drive[nextSpot.id] }));
      }

      if (!tidesByStation[nextSpot.tideStationId]) {
        const tideJson = await fetchTides(nextSpot.tideStationId).catch(() => ({ predictions: [] }));
        setTidesByStation(prev => ({
          ...prev,
          [nextSpot.tideStationId]: tideJson?.predictions || [],
        }));
      }

      setAddSpotName("");
      setAddSpotOpen(false);
      setAddSpotStatus("");
      setSpotRetryTick(0);
      setDriveRetryTick(0);
    } catch (err) {
      setAddSpotStatus(err?.message || "Failed to add spot. Check Anthropic proxy and try again.");
    } finally {
      setAddSpotLoading(false);
    }
  };

  useEffect(() => {
    if (screen !== "dashboard") return;
    const apiKey = (import.meta.env.VITE_TOMTOM_API_KEY || "").trim();
    if (!apiKey) return;
    const unresolvedCount = spots.filter(s => !driveTimes[s.id]).length;
    if (unresolvedCount === 0) return;
    if (driveRetryTick >= 6) return; // Stop after ~1 minute of retries.

    const timer = setTimeout(async () => {
      const originForRetry = driveOriginResolved
        ? `${driveOriginResolved.lat},${driveOriginResolved.lon}`
        : driveOrigin;
      const recovered = await fetchMissingDriveTimes(spots, driveTimes, originForRetry);
      if (Object.keys(recovered).length) {
        setDriveTimes(prev => ({ ...prev, ...recovered }));
      }
      setDriveRetryTick(t => t + 1);
    }, 10000);

    return () => clearTimeout(timer);
  }, [screen, driveTimes, driveRetryTick, driveOrigin, driveOriginResolved, spots]);

  useEffect(() => {
    if (screen !== "dashboard") return;
    const unresolvedCount = spots.filter(s => !spotData[s.id]).length;
    if (unresolvedCount === 0) return;
    if (spotRetryTick >= 6) return; // Stop after ~1 minute of retries.

    const timer = setTimeout(async () => {
      const recovered = await fetchMissingSpotData(spots, spotData);
      if (Object.keys(recovered).length) {
        setSpotData(prev => ({ ...prev, ...recovered }));
      }
      setSpotRetryTick(t => t + 1);
    }, 10000);

    return () => clearTimeout(timer);
  }, [screen, spotData, spotRetryTick, spots]);

  useEffect(() => {
    if (!activeSpot || spots.some(s => s.id === activeSpot.id)) return;
    setActiveSpot(spots[0]);
  }, [spots, activeSpot]);

  if (screen === "setup") return (
    <SetupScreen skill={skill} setSkill={setSkill} quiver={quiver}
      toggleBoard={toggleBoard} customBoard={customBoard}
      setCustomBoard={setCustomBoard} driveOrigin={driveOrigin}
      setDriveOrigin={value => {
        setDriveOrigin(value);
        setDriveOriginResolved(null);
        setDriveOriginStatus("");
        setShowDriveOriginOptions(true);
      }}
      driveOriginStatus={driveOriginStatus}
      driveOriginOptions={driveOriginOptions}
      driveOriginOptionsLoading={driveOriginOptionsLoading}
      showDriveOriginOptions={showDriveOriginOptions}
      onDriveOriginFocus={() => setShowDriveOriginOptions(true)}
      onDriveOriginSelect={handleDriveOriginSelect}
      onDriveOriginBlur={() => {
        setTimeout(() => setShowDriveOriginOptions(false), 120);
        resolveAndAutofillDriveOrigin();
      }}
      onSubmit={loadData} />
  );
  if (screen === "loading") return <LoadingScreen spotCount={spots.length} />;

  return (
    <Dashboard spots={spots} spotData={spotData} driveTimes={driveTimes} activeSpot={activeSpot}
      setActiveSpot={setActiveSpot} tidesByStation={tidesByStation} aiRec={aiRec}
      skill={skill} quiver={quiver} onRefresh={() => callAI(spotData, tidesByStation, spots)}
      addSpotOpen={addSpotOpen} setAddSpotOpen={setAddSpotOpen}
      addSpotName={addSpotName} setAddSpotName={value => {
        setAddSpotName(value);
        setAddSpotStatus("");
      }}
      addSpotStatus={addSpotStatus} addSpotLoading={addSpotLoading}
      onAddSpot={handleAddSpot} />
  );
}
