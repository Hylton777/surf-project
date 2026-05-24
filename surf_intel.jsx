import React, { useState, useEffect } from "react";
import { DEFAULT_NDBC_STATION_ID, DEFAULT_WEIGHTS, SPOT_CONFIGS, getDefaultSurfHeightScale, getDefaultSurfPeriodScale } from "./surfSpotConfigs";
import { computeSurfScore } from "./src/surfScorer";
import {
  computeSurfHeightForecast,
  marineHourFromArrays,
  roundHalfFt,
} from "./src/surfForecast";
import { fetchNdbcBuoyObservation, fetchNdbcBuoysByStation } from "./src/ndbcClient";

// ─── Data ───────────────────────────────────────────────────────────────────

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Space+Mono:wght@400;700&family=Inter:wght@300;400;500;600&display=swap');`;

const SPOTS = [
  { id: "ob", name: "Ocean Beach", shortName: "OB", lat: 37.7594, lon: -122.5107, type: "Beach Break", difficulty: "Intermediate", city: "San Francisco", tideStationId: "9414290", tideStationLabel: "San Francisco (Golden Gate)" },
  { id: "linda_mar", name: "Linda Mar", shortName: "Linda Mar", lat: 37.5841, lon: -122.4994, type: "Beach Break", difficulty: "Beginner–Inter", city: "Pacifica", tideStationId: "9414290", tideStationLabel: "San Francisco (Golden Gate)" },
  { id: "bolinas", name: "Bolinas", shortName: "Bolinas", lat: 37.9074, lon: -122.7174, type: "Point Break", difficulty: "Intermediate", city: "Marin", tideStationId: "9414958", tideStationLabel: "Bolinas Lagoon" },
  { id: "steamer_lane", name: "Steamer Lane", shortName: "Steamer Lane", lat: 36.9514, lon: -122.0267, type: "Point Break", difficulty: "Intermediate", city: "Santa Cruz", tideStationId: "9413745", tideStationLabel: "Santa Cruz, Monterey Bay" },
  { id: "montara", name: "Montara", shortName: "Montara", lat: 37.5396, lon: -122.5167, type: "Beach Break", difficulty: "Intermediate", city: "Montara", tideStationId: "9414131", tideStationLabel: "Pillar Point Harbor" },
  { id: "hmb_surfers_beach", name: "Half Moon Bay (Surfers' Beach)", shortName: "Surfers' Beach", lat: 37.5038, lon: -122.4837, type: "Beach Break", difficulty: "Beginner–Inter", city: "Half Moon Bay", tideStationId: "9414131", tideStationLabel: "Pillar Point Harbor" },
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
const fmtFt = (m, d = 1) => roundHalfFt(mToFt(m)).toFixed(d);
const fmtSurfFt = ft => {
  const rounded = roundHalfFt(ft);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};
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

const getRatingDisplayColor = label => {
  const map = {
    Pumping: "#14532d",
    Good: "#16a34a",
    Decent: "#f59e0b",
    Bad: "#f97316",
    Poor: "#dc2626",
    Dormant: "#000000",
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

const MPH_TO_KNOTS = 0.868976;

const LEGACY_SPOT_CONFIG_ID = {
  ob: "ocean_beach_sf",
  linda_mar: "linda_mar",
  bolinas: "bolinas",
  steamer_lane: "steamer_lane",
  montara: "montara",
  hmb_surfers_beach: "half_moon_bay_surfers_beach",
  mavs: "mavericks",
  pleasure_point: "pleasure_point",
};

const SPOT_CONFIG_BY_ID = SPOT_CONFIGS.reduce((acc, cfg) => {
  acc[cfg.id] = cfg;
  return acc;
}, {});

const getNearestTideValue = tides => {
  if (!Array.isArray(tides) || !tides.length) return null;
  const nowMs = Date.now();
  let best = null;
  for (const t of tides) {
    const ts = new Date(t?.t).getTime();
    const v = Number(t?.v);
    if (!Number.isFinite(ts) || !Number.isFinite(v)) continue;
    const delta = Math.abs(ts - nowMs);
    if (!best || delta < best.delta) best = { delta, value: v };
  }
  return best ? best.value : null;
};

const parseDriveTimeMinutes = drive => {
  if (!drive || typeof drive !== "string") return Number.POSITIVE_INFINITY;
  const text = drive.toLowerCase();
  const hrMatch = text.match(/(\d+)\s*hr/);
  const minMatch = text.match(/(\d+)\s*min/);
  const hrs = hrMatch ? Number(hrMatch[1]) : 0;
  const mins = minMatch ? Number(minMatch[1]) : 0;
  const total = hrs * 60 + mins;
  return total > 0 ? total : Number.POSITIVE_INFINITY;
};

const normalizeConfidence = value => {
  const v = String(value || "").trim().toLowerCase();
  if (v === "high" || v === "medium" || v === "low") return v;
  return "medium";
};

const normalizeBreakTypeKey = value => {
  const v = String(value || "").trim().toLowerCase();
  if (v === "reef_point" || v === "reef point") return "reef_point";
  if (v === "point") return "point";
  if (v === "reef") return "reef";
  return "beach";
};

const normalizeDifficultyKey = value => {
  const v = String(value || "").trim().toLowerCase();
  if (v === "expert") return "expert";
  if (v === "advanced") return "advanced";
  if (v === "intermediate") return "intermediate";
  return "beginner";
};

const breakTypeKeyToDisplay = key => {
  const map = {
    beach: "Beach Break",
    reef: "Reef Break",
    point: "Point Break",
    reef_point: "Reef Break",
  };
  return map[key] || "Beach Break";
};

const difficultyKeyToDisplay = key => {
  const map = {
    beginner: "Beginner",
    intermediate: "Intermediate",
    advanced: "Intermediate",
    expert: "Expert Only",
  };
  return map[key] || "Intermediate";
};

const normalizeWeightsToUnitSum = rawWeights => {
  const candidate = { ...DEFAULT_WEIGHTS, ...(rawWeights || {}) };
  const weights = {
    height: Number(candidate.height) || 0,
    period: Number(candidate.period) || 0,
    direction: Number(candidate.direction) || 0,
    wind: Number(candidate.wind) || 0,
    tide: Number(candidate.tide) || 0,
  };
  let total = weights.height + weights.period + weights.direction + weights.wind + weights.tide;
  if (total <= 0) return { ...DEFAULT_WEIGHTS };

  const normalized = {
    height: weights.height / total,
    period: weights.period / total,
    direction: weights.direction / total,
    wind: weights.wind / total,
    tide: weights.tide / total,
  };

  // Keep a stable 1.0 sum even after rounding in JSON/stringify/display.
  const rounded = {
    height: Number(normalized.height.toFixed(4)),
    period: Number(normalized.period.toFixed(4)),
    direction: Number(normalized.direction.toFixed(4)),
    wind: Number(normalized.wind.toFixed(4)),
    tide: Number(normalized.tide.toFixed(4)),
  };
  const roundedSum = rounded.height + rounded.period + rounded.direction + rounded.wind + rounded.tide;
  rounded.tide = Number((rounded.tide + (1 - roundedSum)).toFixed(4));
  return rounded;
};

const parseJsonObjectFromText = text => {
  const t = String(text || "").trim();
  if (!t) return null;
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1].trim() : t;
  const objMatch = raw.match(/\{[\s\S]*\}/);
  if (!objMatch) return null;
  try {
    return JSON.parse(objMatch[0]);
  } catch {
    return null;
  }
};

const toSlug = value =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const normalizeGeneratedSpotConfig = (cfg, fallbackName) => {
  if (!cfg || typeof cfg !== "object") return null;

  const name = String(cfg.name || fallbackName || "").trim();
  if (!name) return null;

  const latitude = Number(cfg.latitude);
  const longitude = Number(cfg.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const dirs = Array.isArray(cfg.optimal_swell_directions)
    ? cfg.optimal_swell_directions.map(Number).filter(Number.isFinite).slice(0, 3)
    : [];
  if (!dirs.length) return null;

  const tideRangeRaw = Array.isArray(cfg.optimal_tide_range_ft) ? cfg.optimal_tide_range_ft : [];
  const tideRange = [Number(tideRangeRaw[0]), Number(tideRangeRaw[1])];
  if (!Number.isFinite(tideRange[0]) || !Number.isFinite(tideRange[1])) return null;
  const normalizedTideRange = tideRange[0] <= tideRange[1] ? tideRange : [tideRange[1], tideRange[0]];

  const normalized = {
    id: toSlug(cfg.id || name) || toSlug(fallbackName) || "custom_spot",
    name,
    region: String(cfg.region || "").trim() || deriveCityFromPlaceOrLabel(name, "Custom"),
    latitude,
    longitude,
    break_type: normalizeBreakTypeKey(cfg.break_type),
    difficulty: normalizeDifficultyKey(cfg.difficulty),
    break_facing_direction: ((Number(cfg.break_facing_direction) || 0) % 360 + 360) % 360,
    optimal_swell_directions: dirs.map(d => ((d % 360) + 360) % 360),
    swell_direction_tolerance: Math.max(10, Math.min(60, Number(cfg.swell_direction_tolerance) || 30)),
    min_rideable_ft: Math.max(0.5, Number(cfg.min_rideable_ft) || 1),
    optimal_height_min_ft: Math.max(0.5, Number(cfg.optimal_height_min_ft) || 2),
    optimal_height_max_ft: Math.max(0.5, Number(cfg.optimal_height_max_ft) || 4),
    max_rideable_ft: Math.max(1, Number(cfg.max_rideable_ft) || 8),
    min_period_s: Math.max(5, Number(cfg.min_period_s) || 8),
    optimal_tide_range_ft: normalizedTideRange,
    tide_preference: ["low", "mid", "high", "any"].includes(String(cfg.tide_preference || "").trim().toLowerCase())
      ? String(cfg.tide_preference).trim().toLowerCase()
      : "mid",
    noaa_tide_station_id: cfg.noaa_tide_station_id == null ? null : String(cfg.noaa_tide_station_id).trim(),
    ndbc_station_id: cfg.ndbc_station_id == null || String(cfg.ndbc_station_id).trim() === ""
      ? null
      : String(cfg.ndbc_station_id).replace(/\D/g, ""),
    face_multiplier: Number.isFinite(Number(cfg.face_multiplier)) && Number(cfg.face_multiplier) > 0
      ? Number(cfg.face_multiplier)
      : null,
    surf_height_scale: (() => {
      const custom = Number(cfg.surf_height_scale);
      if (Number.isFinite(custom) && custom > 0) return Math.min(1.5, custom);
      return getDefaultSurfHeightScale(normalizeBreakTypeKey(cfg.break_type));
    })(),
    surf_period_scale: (() => {
      const custom = Number(cfg.surf_period_scale);
      if (Number.isFinite(custom) && custom > 0) return Math.min(1.2, custom);
      return getDefaultSurfPeriodScale(normalizeBreakTypeKey(cfg.break_type));
    })(),
    weights: normalizeWeightsToUnitSum(cfg.weights),
    notes: String(cfg.notes || "").trim() || "User-added surf break configuration.",
    isUserAdded: true,
    confidence: normalizeConfidence(cfg.confidence),
  };

  if (normalized.optimal_height_min_ft < normalized.min_rideable_ft) {
    normalized.optimal_height_min_ft = normalized.min_rideable_ft;
  }
  if (normalized.optimal_height_max_ft < normalized.optimal_height_min_ft) {
    normalized.optimal_height_max_ft = normalized.optimal_height_min_ft;
  }
  if (normalized.max_rideable_ft < normalized.optimal_height_max_ft) {
    normalized.max_rideable_ft = normalized.optimal_height_max_ft;
  }

  return normalized;
};

const computeDisplayScore = (spot, d, tidesByStation) => {
  if (!spot || !d) return null;
  const spotConfig = getSpotScoringConfig(spot);
  if (!spotConfig) return null;

  const conditions = {
    swellHeight: Number.isFinite(d.surfHeightFt) ? d.surfHeightFt : 0,
    swellPeriod: Number.isFinite(d.swellPeriod) && d.swellPeriod > 0 ? d.swellPeriod : d.wavePeriod,
    swellDirection: Number.isFinite(d.swellDir) ? d.swellDir : d.waveDir,
    windSpeed: (Number(d.windSpeed) || 0) * MPH_TO_KNOTS,
    windDirection: Number(d.windDir) || 0,
    tide: getNearestTideValue(tidesByStation?.[spot.tideStationId]),
  };
  return computeSurfScore(conditions, spotConfig);
};

const sortSpotsByScore = (spots, spotData, tidesByStation, driveTimes) =>
  [...spots].sort((a, b) => {
    const aScore = computeDisplayScore(a, spotData[a.id], tidesByStation)?.score ?? -1;
    const bScore = computeDisplayScore(b, spotData[b.id], tidesByStation)?.score ?? -1;
    if (bScore !== aScore) return bScore - aScore;
    const aDrive = parseDriveTimeMinutes(driveTimes[a.id]);
    const bDrive = parseDriveTimeMinutes(driveTimes[b.id]);
    if (aDrive !== bDrive) return aDrive - bDrive;
    return a.shortName.localeCompare(b.shortName);
  });

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

const getSpotScoringConfig = spot => {
  const configId = LEGACY_SPOT_CONFIG_ID[spot.id];
  return spot.scoringConfig || (configId ? SPOT_CONFIG_BY_ID[configId] : null);
};

const getNdbcStationIdForSpot = spot => {
  const cfg = getSpotScoringConfig(spot);
  return cfg?.ndbc_station_id || DEFAULT_NDBC_STATION_ID;
};

const getNearestBuoyMeta = (lat, lon) => {
  const nearest = SPOTS.reduce((best, s) => {
    const dLat = s.lat - lat;
    const dLon = s.lon - lon;
    const score = dLat * dLat + dLon * dLon;
    if (!best || score < best.score) return { score, spot: s };
    return best;
  }, null);
  const refSpot = nearest?.spot || SPOTS[0];
  return { ndbcStationId: getNdbcStationIdForSpot(refSpot) };
};

const buoyObservationForBlend = obs =>
  obs && Number.isFinite(obs.hsM)
    ? {
        hsM: obs.hsM,
        swellHsM: obs.swellHsM,
        periodS: obs.periodS,
        directionDeg: obs.directionDeg,
        ageMinutes: obs.ageMinutes,
      }
    : null;

const forecastHourAtIndex = (marineJson, spotConfig, buoyObservation, i) => {
  const marineHour = marineHourFromArrays(marineJson.hourly, i);
  return computeSurfHeightForecast({ marineHour, spotConfig, buoyObservation });
};

const buildSurfHeightSeries = (marineJson, spotConfig, buoyObservation, startIdx, count) => {
  const len = marineJson?.hourly?.time?.length || 0;
  const series = [];
  for (let i = startIdx; i < startIdx + count && i < len; i++) {
    series.push(forecastHourAtIndex(marineJson, spotConfig, buoyObservation, i).surfHeightFt);
  }
  return series;
};

// ─── API ─────────────────────────────────────────────────────────────────────

const fetchMarine = (lat, lon) =>
  fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&hourly=wave_height,wave_period,wave_peak_period,wave_direction,swell_wave_height,swell_wave_period,swell_wave_peak_period,swell_wave_direction,secondary_swell_wave_height,secondary_swell_wave_period,secondary_swell_wave_direction,wind_wave_height,wind_wave_period,wind_wave_peak_period,wind_wave_direction&forecast_days=2&timezone=America%2FLos_Angeles`)
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

const fetchSurfSpotConfigFromAnthropic = async (spotName, regionHint) => {
  const anthropicUrl = getAnthropicMessagesUrl();
  const model = (import.meta.env.VITE_ANTHROPIC_SPOT_CONFIG_MODEL || import.meta.env.VITE_ANTHROPIC_MODEL || "claude-haiku-4-5-20251001").trim();
  const res = await fetch(anthropicUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 1400,
      system: `You are a surf forecasting expert with deep knowledge of surf breaks worldwide. When given the name of a surf break, you return a precise JSON configuration object for that break. You must respond with valid JSON only - no explanation, no markdown, no backticks. If you are uncertain about a value, make the most accurate estimate you can based on the break's known geography, coastline orientation, and surf characteristics. Never refuse - always return a best-effort JSON object.`,
      messages: [{
        role: "user",
        content: `Return a JSON object for the surf break: "${spotName}"

Regional context for disambiguation: ${regionHint || "California coast, USA"}

The object must have exactly these fields:

{
  "id": string (slugified name, e.g. "the_hook"),
  "name": string (proper display name),
  "region": string (city or region name),
  "latitude": number,
  "longitude": number,
  "break_type": "beach" | "reef" | "point" | "reef_point",
  "difficulty": "beginner" | "intermediate" | "advanced" | "expert",
  "break_facing_direction": number (degrees 0–360, direction break faces toward ocean),
  "optimal_swell_directions": number[] (1–3 swell directions in degrees that work best),
  "swell_direction_tolerance": number (degrees, typically 15–45),
  "min_rideable_ft": number,
  "optimal_height_min_ft": number,
  "optimal_height_max_ft": number,
  "max_rideable_ft": number,
  "min_period_s": number,
  "optimal_tide_range_ft": [number, number] (MLLW feet, e.g. [1.0, 3.5]),
  "tide_preference": "low" | "mid" | "high" | "any",
  "noaa_tide_station_id": string (ID of nearest NOAA tide station),
  "ndbc_station_id": string | null (nearest NDBC buoy, e.g. "46214" Half Moon Bay, "46042" Monterey, "46013" Bodega Bay),
  "face_multiplier": number | null (optional Hs→face override for unusual breaks),
  "surf_height_scale": number (0.4–0.7 typical; calibrates displayed face height to local break — beach ~0.54, reef_point ~0.62, reef ~0.48),
  "surf_period_scale": number (0.9–1.0 typical; calibrates displayed swell period — beach ~0.93, reef_point ~0.96),
  "weights": {
    "height": number,
    "period": number,
    "direction": number,
    "wind": number,
    "tide": number
  },
  "notes": string (2–3 sentences on what makes this break unique),
  "isUserAdded": true,
  "confidence": "high" | "medium" | "low"
}

For weights: all 5 values must sum to exactly 1.0. Keep height around 0.20 (users see wave size separately in the UI); weight period, direction, wind, and tide more heavily. Reef/point breaks should weight direction and period higher; tide-sensitive breaks should weight tide higher; big wave spots should weight period highest.

For noaa_tide_station_id: return the nearest NOAA CO-OPS station.
Common references:
- San Francisco area: 9414290
- Point Reyes: 9415020
- Santa Cruz: 9413745
- Monterey: 9413450
- San Diego: 9410170
- Los Angeles / Santa Monica: 9410660
- Morro Bay: 9412110
- Crescent City: 9419750
- Newport Oregon: 9435380
- If outside the US, set noaa_tide_station_id to null.

For ndbc_station_id: return nearest NDBC buoy ID for US West Coast breaks.
Common references: 46214 (Half Moon Bay), 46042 (Monterey), 46013 (Bodega Bay), 46026 (San Francisco).
If outside the US or unknown, set ndbc_station_id to null.

For surf_height_scale: use break-type defaults unless you know the spot well — beach 0.54, reef_point 0.62, reef 0.48, point 0.62.

For confidence: "high" if strongly known, "medium" if regional estimate, "low" if ambiguous/obscure.

Return JSON only.`,
      }],
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error?.message || json.message || `HTTP ${res.status}`);
  }
  const text = json.content?.find(b => b.type === "text")?.text || "";
  const parsed = parseJsonObjectFromText(text);
  return normalizeGeneratedSpotConfig(parsed, spotName);
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

const buildSpotCondition = (spot, marineJson, windJson, buoyByStation = {}) => {
  if (!marineJson?.hourly) return null;
  const spotConfig = getSpotScoringConfig(spot);
  if (!spotConfig) return null;

  const ndbcId = getNdbcStationIdForSpot(spot);
  const buoyObservation = buoyObservationForBlend(buoyByStation[ndbcId]);

  const hi = getCurrentHourIdx(marineJson.hourly.time);
  const wi = alignHourIdx(marineJson.hourly.time, windJson?.hourly?.time, hi);
  const sl = (arr, start, n = 12) => (arr || []).slice(start, start + n);

  const hourlyTimes = marineJson.hourly.time || [];
  const todayPrefix = (hourlyTimes[hi] || hourlyTimes[0] || "").slice(0, 10);
  const dayStartIdx = todayPrefix
    ? Math.max(0, hourlyTimes.findIndex(t => typeof t === "string" && t.startsWith(todayPrefix)))
    : 0;
  const dayTimes = hourlyTimes.slice(dayStartIdx, dayStartIdx + 24);

  const currentForecast = forecastHourAtIndex(marineJson, spotConfig, buoyObservation, hi);
  const daySurfHeights = buildSurfHeightSeries(marineJson, spotConfig, buoyObservation, dayStartIdx, 24);
  const forecastSurf = buildSurfHeightSeries(marineJson, spotConfig, buoyObservation, hi, 12);

  return {
    waveHeight: marineJson.hourly.wave_height?.[hi] ?? 0,
    wavePeriod: marineJson.hourly.wave_period?.[hi] ?? 0,
    waveDir: marineJson.hourly.wave_direction?.[hi] ?? 0,
    swellHeight: marineJson.hourly.swell_wave_height?.[hi] ?? 0,
    swellPeriod: currentForecast.swellPeriod,
    swellDir: currentForecast.swellDir ?? marineJson.hourly.swell_wave_direction?.[hi] ?? 0,
    windWaveHeight: marineJson.hourly.wind_wave_height?.[hi] ?? 0,
    windSpeed: windJson?.hourly?.wind_speed_10m?.[wi] ?? 0,
    windDir: windJson?.hourly?.wind_direction_10m?.[wi] ?? 0,
    surfHeightFt: currentForecast.surfHeightFt,
    surfHeightDescriptor: currentForecast.descriptor,
    swellHsFt: currentForecast.swellHsFt,
    forecastSource: currentForecast.source,
    buoyHsFt: currentForecast.buoyHsFt,
    buoyAgeMinutes: currentForecast.buoyAgeMinutes,
    ndbcStationId: ndbcId,
    times: sl(marineJson.hourly.time, hi),
    forecastWave: forecastSurf,
    forecastWind: sl(windJson?.hourly?.wind_speed_10m, wi),
    dayTimes,
    dayWaveHeights: daySurfHeights,
    daySurfHeights,
  };
};

const fetchSpotCondition = async (spot, buoyByStation = {}) => {
  try {
    const marine = await fetchMarine(spot.lat, spot.lon).catch(() => null);
    if (!marine?.hourly) return null;
    const lat = marine?.latitude ?? spot.lat;
    const lon = marine?.longitude ?? spot.lon;
    const wind = await fetchWind(lat, lon).catch(() => null);
    return buildSpotCondition(spot, marine, wind, buoyByStation);
  } catch {
    return null;
  }
};

const fetchMissingSpotData = async (spots, existingSpotData = {}, buoyByStation = {}) => {
  const missing = spots.filter(s => !existingSpotData[s.id]);
  if (!missing.length) return {};
  const pairs = await Promise.all(
    missing.map(async spot => [spot.id, await fetchSpotCondition(spot, buoyByStation)])
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
        textAnchor="middle" fontSize="8" fill={color} opacity="0.8">{fmtSurfFt(max)}ft</text>
    </svg>
  );
}

function TideChart({ tides, syncMs = null, onSyncHover }) {
  const [hover, setHover] = useState(null);

  if (!tides?.length) return <p style={{ color: THEME.textSoft, fontSize: 12 }}>No tide data available.</p>;

  const parseTideTime = s => {
    const m = String(s || "").match(/(\d{4})-(\d{2})-(\d{2})[\sT](\d{2}):(\d{2})/);
    if (!m) return NaN;
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
  };
  const fmtHM = ms => {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const parsed = tides
    .map(t => ({ ...t, ms: parseTideTime(t.t), height: parseFloat(t.v) }))
    .filter(p => Number.isFinite(p.ms) && Number.isFinite(p.height))
    .sort((a, b) => a.ms - b.ms);

  if (!parsed.length) return <p style={{ color: THEME.textSoft, fontSize: 12 }}>No tide data available.</p>;

  const dateStr = parsed[0].t.slice(0, 10);
  const dateParts = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  const start = dateParts
    ? new Date(+dateParts[1], +dateParts[2] - 1, +dateParts[3]).getTime()
    : new Date(parsed[0].ms).setHours(0, 0, 0, 0);
  const dayMs = 24 * 60 * 60 * 1000;
  const end = start + dayMs;

  const inWindow = parsed.filter(p => p.ms >= start && p.ms <= end);
  if (!inWindow.length) return <p style={{ color: THEME.textSoft, fontSize: 12 }}>No tide data available.</p>;
  const before = parsed.filter(p => p.ms < start).slice(-1);
  const after = parsed.filter(p => p.ms > end).slice(0, 1);
  const curvePoints = [...before, ...inWindow, ...after];

  const W = 420, H = 88;
  const padTop = 30, padBot = 18, padX = 22;
  const innerW = W - 2 * padX;
  const innerH = H - padTop - padBot;
  const allHeights = curvePoints.map(p => p.height);
  const min = Math.min(...allHeights) - 0.3;
  const max = Math.max(...allHeights) + 0.3;
  const xFor = ms => padX + ((ms - start) / dayMs) * innerW;
  const yFor = h => H - padBot - ((h - min) / (max - min)) * innerH;

  const cps = curvePoints.map(p => ({ ...p, x: xFor(p.ms), y: yFor(p.height) }));

  let path = `M ${cps[0].x},${cps[0].y}`;
  for (let i = 1; i < cps.length; i++) {
    const x0 = cps[i - 1].x, y0 = cps[i - 1].y;
    const x1 = cps[i].x, y1 = cps[i].y;
    const cx = (x0 + x1) / 2;
    path += ` C ${cx},${y0} ${cx},${y1} ${x1},${y1}`;
  }

  const samples = [];
  for (let i = 1; i < cps.length; i++) {
    const x0 = cps[i - 1].x, y0 = cps[i - 1].y;
    const x1 = cps[i].x, y1 = cps[i].y;
    const cx = (x0 + x1) / 2;
    const N = 48;
    for (let k = 0; k <= N; k++) {
      const t = k / N;
      const mt = 1 - t;
      const xs = mt * mt * mt * x0 + 3 * mt * mt * t * cx + 3 * mt * t * t * cx + t * t * t * x1;
      const ys = mt * mt * mt * y0 + 3 * mt * mt * t * y0 + 3 * mt * t * t * y1 + t * t * t * y1;
      samples.push({ x: xs, y: ys });
    }
  }
  samples.sort((a, b) => a.x - b.x);

  const sampleAtX = px => {
    if (!samples.length) return null;
    if (px <= samples[0].x) return samples[0];
    if (px >= samples[samples.length - 1].x) return samples[samples.length - 1];
    let lo = 0, hi = samples.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (samples[mid].x < px) lo = mid;
      else hi = mid;
    }
    const a = samples[lo], b = samples[hi];
    const t = (px - a.x) / ((b.x - a.x) || 1);
    return { x: px, y: a.y + (b.y - a.y) * t };
  };

  const valueFromY = py => min + ((H - padBot - py) / innerH) * (max - min);
  const timeFromX = px => start + ((px - padX) / innerW) * dayMs;

  const onMove = e => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const scale = Math.min(rect.width / W, rect.height / H);
    const xMargin = (rect.width - W * scale) / 2;
    const raw = (e.clientX - rect.left - xMargin) / scale;
    const px = Math.min(Math.max(raw, padX), W - padX);
    const s = sampleAtX(px);
    if (!s) return;
    const ms = timeFromX(px);
    setHover({ x: px, y: s.y, value: valueFromY(s.y), ms });
    if (onSyncHover) onSyncHover(ms);
  };

  const onLeave = () => {
    setHover(null);
    if (onSyncHover) onSyncHover(null);
  };

  const remoteHover = (() => {
    if (hover) return null;
    if (syncMs == null) return null;
    if (syncMs < start || syncMs > end) return null;
    const px = Math.min(Math.max(xFor(syncMs), padX), W - padX);
    const s = sampleAtX(px);
    if (!s) return null;
    return { x: px, y: s.y, value: valueFromY(s.y), ms: syncMs };
  })();
  const effectiveHover = hover || remoteHover;

  const ticks = ["00:00", "06:00", "12:00", "18:00", "00:00"];
  const tooltipW = 64, tooltipH = 26, tooltipGap = 8;
  const tooltipX = effectiveHover
    ? Math.min(Math.max(effectiveHover.x - tooltipW / 2, 2), W - tooltipW - 2)
    : 0;
  const tooltipAbove = effectiveHover ? effectiveHover.y - tooltipGap - tooltipH >= 0 : true;
  const tooltipY = effectiveHover
    ? (tooltipAbove ? effectiveHover.y - tooltipGap - tooltipH : effectiveHover.y + tooltipGap)
    : 0;

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: H, display: "block", cursor: "crosshair" }}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
      >
        <defs>
          <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={THEME.accent} stopOpacity="0.3" />
            <stop offset="100%" stopColor={THEME.accent} stopOpacity="0.02" />
          </linearGradient>
          <clipPath id="tideClip">
            <rect x={padX} y="0" width={innerW} height={H - padBot} />
          </clipPath>
        </defs>
        <g clipPath="url(#tideClip)">
          <path d={path + ` L ${cps[cps.length - 1].x},${H - padBot} L ${cps[0].x},${H - padBot} Z`} fill="url(#tg)" />
          <path d={path} fill="none" stroke={THEME.accent} strokeWidth="1.5" />
          {[0.25, 0.5, 0.75].map(f => (
            <line
              key={f}
              x1={padX + f * innerW}
              y1={padTop - 6}
              x2={padX + f * innerW}
              y2={H - padBot}
              stroke={THEME.border}
              strokeOpacity="0.6"
              strokeDasharray="2,3"
              strokeWidth="1"
            />
          ))}
          {cps
            .filter(p => p.ms >= start && p.ms <= end)
            .map((p, i) => (
              <g key={`hl-${i}`}>
                <circle cx={p.x} cy={p.y} r="3" fill={THEME.accent} />
                <text
                  x={p.x}
                  y={p.y - 12}
                  textAnchor="middle"
                  fontSize="8"
                  fill={THEME.textSoft}
                >
                  {p.type === "H" ? "▲" : "▼"} {p.height.toFixed(1)}ft
                </text>
                <text
                  x={p.x}
                  y={p.y - 4}
                  textAnchor="middle"
                  fontSize="7"
                  fill={THEME.muted}
                  fontFamily="'Space Mono', monospace"
                >
                  {fmtHM(p.ms)}
                </text>
              </g>
            ))}
        </g>
        {effectiveHover && (
          <g pointerEvents="none">
            <line
              x1={effectiveHover.x}
              y1={padTop - 6}
              x2={effectiveHover.x}
              y2={H - padBot}
              stroke={THEME.accent}
              strokeOpacity="0.5"
              strokeDasharray="2,2"
              strokeWidth="1"
            />
            <circle
              cx={effectiveHover.x}
              cy={effectiveHover.y}
              r="3.5"
              fill="#fff"
              stroke={THEME.accent}
              strokeWidth="1.5"
            />
            <rect
              x={tooltipX}
              y={tooltipY}
              width={tooltipW}
              height={tooltipH}
              rx="3"
              ry="3"
              fill="#ffffff"
              stroke={THEME.accent}
              strokeOpacity="0.5"
              strokeWidth="1"
            />
            <text
              x={tooltipX + tooltipW / 2}
              y={tooltipY + 11}
              textAnchor="middle"
              fontSize="8"
              fill={THEME.text}
              fontFamily="'Space Mono', monospace"
            >
              {fmtHM(effectiveHover.ms)}
            </text>
            <text
              x={tooltipX + tooltipW / 2}
              y={tooltipY + 21}
              textAnchor="middle"
              fontSize="9"
              fill={THEME.accent}
              fontFamily="'Space Mono', monospace"
              fontWeight="700"
            >
              {effectiveHover.value.toFixed(2)}ft
            </text>
          </g>
        )}
        {ticks.map((t, i) => (
          <text
            key={`tick-${i}`}
            x={padX + (i / (ticks.length - 1)) * innerW}
            y={H - 4}
            textAnchor="middle"
            fontSize="9"
            fill={THEME.textSoft}
            fontFamily="'Space Mono', monospace"
          >
            {t}
          </text>
        ))}
      </svg>
    </div>
  );
}

function WaveForecastChart({ times, heights, syncMs = null, onSyncHover }) {
  const [hover, setHover] = useState(null);

  if (!times?.length || !heights?.length) {
    return <p style={{ color: THEME.textSoft, fontSize: 12 }}>No forecast available.</p>;
  }

  const parseHourTime = s => {
    const m = String(s || "").match(/(\d{4})-(\d{2})-(\d{2})[\sT](\d{2}):(\d{2})/);
    if (!m) return NaN;
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
  };
  const fmtHM = ms => {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const points = times
    .map((t, i) => ({ t, ms: parseHourTime(t), heightFt: Number(heights[i]) }))
    .filter(p => Number.isFinite(p.ms) && Number.isFinite(p.heightFt));

  if (!points.length) {
    return <p style={{ color: THEME.textSoft, fontSize: 12 }}>No forecast available.</p>;
  }

  const dateStr = points[0].t.slice(0, 10);
  const dateParts = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  const start = dateParts
    ? new Date(+dateParts[1], +dateParts[2] - 1, +dateParts[3]).getTime()
    : new Date(points[0].ms).setHours(0, 0, 0, 0);
  const dayMs = 24 * 60 * 60 * 1000;
  const end = start + dayMs;

  const inWindow = points.filter(p => p.ms >= start && p.ms <= end);
  if (!inWindow.length) {
    return <p style={{ color: THEME.textSoft, fontSize: 12 }}>No forecast available.</p>;
  }

  const W = 420, H = 88;
  const padTop = 30, padBot = 18, padX = 22;
  const innerW = W - 2 * padX;
  const innerH = H - padTop - padBot;
  const heightsFt = inWindow.map(p => p.heightFt);
  const min = Math.min(...heightsFt) - 0.3;
  const max = Math.max(...heightsFt) + 0.3;
  const safeRange = max - min || 1;
  const xFor = ms => padX + ((ms - start) / dayMs) * innerW;
  const yFor = ft => H - padBot - ((ft - min) / safeRange) * innerH;

  const cps = inWindow.map(p => ({ ...p, x: xFor(p.ms), y: yFor(p.heightFt) }));

  let path = `M ${cps[0].x},${cps[0].y}`;
  for (let i = 1; i < cps.length; i++) {
    const x0 = cps[i - 1].x, y0 = cps[i - 1].y;
    const x1 = cps[i].x, y1 = cps[i].y;
    const cx = (x0 + x1) / 2;
    path += ` C ${cx},${y0} ${cx},${y1} ${x1},${y1}`;
  }

  const samples = [];
  for (let i = 1; i < cps.length; i++) {
    const x0 = cps[i - 1].x, y0 = cps[i - 1].y;
    const x1 = cps[i].x, y1 = cps[i].y;
    const cx = (x0 + x1) / 2;
    const N = 24;
    for (let k = 0; k <= N; k++) {
      const t = k / N;
      const mt = 1 - t;
      const xs = mt * mt * mt * x0 + 3 * mt * mt * t * cx + 3 * mt * t * t * cx + t * t * t * x1;
      const ys = mt * mt * mt * y0 + 3 * mt * mt * t * y0 + 3 * mt * t * t * y1 + t * t * t * y1;
      samples.push({ x: xs, y: ys });
    }
  }
  samples.sort((a, b) => a.x - b.x);

  const sampleAtX = px => {
    if (!samples.length) return null;
    if (px <= samples[0].x) return samples[0];
    if (px >= samples[samples.length - 1].x) return samples[samples.length - 1];
    let lo = 0, hi = samples.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (samples[mid].x < px) lo = mid;
      else hi = mid;
    }
    const a = samples[lo], b = samples[hi];
    const t = (px - a.x) / ((b.x - a.x) || 1);
    return { x: px, y: a.y + (b.y - a.y) * t };
  };

  const valueFromY = py => min + ((H - padBot - py) / innerH) * safeRange;
  const timeFromX = px => start + ((px - padX) / innerW) * dayMs;

  const onMove = e => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const scale = Math.min(rect.width / W, rect.height / H);
    const xMargin = (rect.width - W * scale) / 2;
    const raw = (e.clientX - rect.left - xMargin) / scale;
    const px = Math.min(Math.max(raw, padX), W - padX);
    const s = sampleAtX(px);
    if (!s) return;
    const ms = timeFromX(px);
    setHover({ x: px, y: s.y, value: valueFromY(s.y), ms });
    if (onSyncHover) onSyncHover(ms);
  };

  const onLeave = () => {
    setHover(null);
    if (onSyncHover) onSyncHover(null);
  };

  const remoteHover = (() => {
    if (hover) return null;
    if (syncMs == null) return null;
    if (syncMs < start || syncMs > end) return null;
    const px = Math.min(Math.max(xFor(syncMs), padX), W - padX);
    const s = sampleAtX(px);
    if (!s) return null;
    return { x: px, y: s.y, value: valueFromY(s.y), ms: syncMs };
  })();
  const effectiveHover = hover || remoteHover;

  const peak = cps.reduce((best, p) => (p.heightFt > best.heightFt ? p : best), cps[0]);
  const ticks = ["00:00", "06:00", "12:00", "18:00", "00:00"];
  const tooltipW = 64, tooltipH = 26, tooltipGap = 8;
  const tooltipX = effectiveHover
    ? Math.min(Math.max(effectiveHover.x - tooltipW / 2, 2), W - tooltipW - 2)
    : 0;
  const tooltipAbove = effectiveHover ? effectiveHover.y - tooltipGap - tooltipH >= 0 : true;
  const tooltipY = effectiveHover
    ? (tooltipAbove ? effectiveHover.y - tooltipGap - tooltipH : effectiveHover.y + tooltipGap)
    : 0;

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: H, display: "block", cursor: "crosshair" }}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
      >
        <defs>
          <linearGradient id="wfg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={THEME.accent} stopOpacity="0.3" />
            <stop offset="100%" stopColor={THEME.accent} stopOpacity="0.02" />
          </linearGradient>
          <clipPath id="waveClip">
            <rect x={padX} y="0" width={innerW} height={H - padBot} />
          </clipPath>
        </defs>
        <g clipPath="url(#waveClip)">
          <path d={path + ` L ${cps[cps.length - 1].x},${H - padBot} L ${cps[0].x},${H - padBot} Z`} fill="url(#wfg)" />
          <path d={path} fill="none" stroke={THEME.accent} strokeWidth="1.5" />
          {[0.25, 0.5, 0.75].map(f => (
            <line
              key={f}
              x1={padX + f * innerW}
              y1={padTop - 6}
              x2={padX + f * innerW}
              y2={H - padBot}
              stroke={THEME.border}
              strokeOpacity="0.6"
              strokeDasharray="2,3"
              strokeWidth="1"
            />
          ))}
          {peak && (
            <g>
              <circle cx={peak.x} cy={peak.y} r="3" fill={THEME.accent} />
              <text
                x={peak.x}
                y={peak.y - 12}
                textAnchor="middle"
                fontSize="8"
                fill={THEME.textSoft}
              >
                ▲ {fmtSurfFt(peak.heightFt)}ft
              </text>
              <text
                x={peak.x}
                y={peak.y - 4}
                textAnchor="middle"
                fontSize="7"
                fill={THEME.muted}
                fontFamily="'Space Mono', monospace"
              >
                {fmtHM(peak.ms)}
              </text>
            </g>
          )}
        </g>
        {effectiveHover && (
          <g pointerEvents="none">
            <line
              x1={effectiveHover.x}
              y1={padTop - 6}
              x2={effectiveHover.x}
              y2={H - padBot}
              stroke={THEME.accent}
              strokeOpacity="0.5"
              strokeDasharray="2,2"
              strokeWidth="1"
            />
            <circle
              cx={effectiveHover.x}
              cy={effectiveHover.y}
              r="3.5"
              fill="#fff"
              stroke={THEME.accent}
              strokeWidth="1.5"
            />
            <rect
              x={tooltipX}
              y={tooltipY}
              width={tooltipW}
              height={tooltipH}
              rx="3"
              ry="3"
              fill="#ffffff"
              stroke={THEME.accent}
              strokeOpacity="0.5"
              strokeWidth="1"
            />
            <text
              x={tooltipX + tooltipW / 2}
              y={tooltipY + 11}
              textAnchor="middle"
              fontSize="8"
              fill={THEME.text}
              fontFamily="'Space Mono', monospace"
            >
              {fmtHM(effectiveHover.ms)}
            </text>
            <text
              x={tooltipX + tooltipW / 2}
              y={tooltipY + 21}
              textAnchor="middle"
              fontSize="9"
              fill={THEME.accent}
              fontFamily="'Space Mono', monospace"
              fontWeight="700"
            >
              {fmtSurfFt(effectiveHover.value)}ft
            </text>
          </g>
        )}
        {ticks.map((t, i) => (
          <text
            key={`wf-tick-${i}`}
            x={padX + (i / (ticks.length - 1)) * innerW}
            y={H - 4}
            textAnchor="middle"
            fontSize="9"
            fill={THEME.textSoft}
            fontFamily="'Space Mono', monospace"
          >
            {t}
          </text>
        ))}
      </svg>
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
  aiCalled,
  skill,
  quiver,
  onGenerateAi,
  addSpotOpen,
  setAddSpotOpen,
  addSpotName,
  setAddSpotName,
  addSpotStatus,
  addSpotLoading,
  onAddSpot,
}) {
  const [syncMs, setSyncMs] = useState(null);
  const data = spotData[activeSpot.id];
  const spotTides = tidesByStation[activeSpot.tideStationId] || [];
  const activeSpotScore = computeDisplayScore(activeSpot, data, tidesByStation);
  const sortedSpots = sortSpotsByScore(spots, spotData, tidesByStation, driveTimes);

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
            {sortedSpots.map(spot => {
              const d = spotData[spot.id];
              const scoreResult = computeDisplayScore(spot, d, tidesByStation);
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
                  </div>
                  {scoreResult && (
                    <div style={{ fontSize: 10, color: getRatingDisplayColor(scoreResult.rating), fontFamily: "'Space Mono', monospace", fontWeight: 700, marginBottom: 4 }}>
                      {scoreResult.score}/100 · {scoreResult.rating}
                    </div>
                  )}
                  <div style={{ fontSize: 9, color: THEME.muted, marginBottom: 5 }}>{spot.type} · {spot.city}</div>
                  {d ? (
                    <>
                      <div style={{ fontSize: 11, color: THEME.text, fontFamily: "'Space Mono', monospace" }}>
                        {fmtSurfFt(d.surfHeightFt)}ft @ {d.swellPeriod?.toFixed(0)}s
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
                  {activeSpotScore && (
                    <div style={{
                      fontSize: 10,
                      color: getRatingDisplayColor(activeSpotScore.rating),
                      fontFamily: "'Space Mono', monospace",
                      fontWeight: 700,
                      letterSpacing: 1.5,
                      border: `1px solid ${getRatingDisplayColor(activeSpotScore.rating)}30`,
                      padding: "4px 10px",
                      borderRadius: 3,
                      background: `${getRatingDisplayColor(activeSpotScore.rating)}12`,
                    }}>
                      SCORE {activeSpotScore.score}/100 · {activeSpotScore.rating.toUpperCase()}
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: THEME.textSoft, fontFamily: "'Space Mono', monospace", letterSpacing: 1.5 }}>
                    {driveTimes[activeSpot.id] ? `${driveTimes[activeSpot.id]} DRIVE` : "DRIVE TIME —"}
                  </div>
                </div>
              </div>

              {/* Stat cards */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
                {[
                  {
                    label: "SURF HEIGHT",
                    value: `${fmtSurfFt(data.surfHeightFt)}ft`,
                    sub: [
                      data.swellPeriod ? `${data.swellPeriod.toFixed(0)}s period` : "",
                      data.forecastSource === "blend" ? `NDBC ${data.ndbcStationId} blend` : "",
                    ].filter(Boolean).join(" · "),
                  },
                  { label: "SWELL DIR", value: degToCompass(data.swellDir), sub: `${Math.round(data.swellDir || 0)}° bearing` },
                  {
                    label: "WIND",
                    valueElement: (
                      <span style={{ position: "relative", display: "inline-block", width: "100%" }}>
                        <span>{`${data.windSpeed?.toFixed(0)}mph`}</span>
                        <svg
                          width="46"
                          height="46"
                          viewBox="0 0 24 24"
                          style={{ position: "absolute", right: 8, top: "50%", transform: `translateY(-50%) rotate(${(data.windDir || 0) + 180}deg)`, flexShrink: 0 }}
                        >
                          <path
                            d="M12 3 L12 21 M5 10 L12 3 L19 10"
                            stroke={THEME.accent}
                            strokeWidth="2.5"
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                    ),
                    sub: `from ${degToCompass(data.windDir)}`,
                  },
                ].map(c => (
                  <div key={c.label} style={{ background: THEME.panel, borderRadius: 8, padding: "13px 14px", border: `1px solid ${THEME.border}` }}>
                    <div style={{ fontSize: 8, letterSpacing: 3, color: THEME.muted, marginBottom: 8 }}>{c.label}</div>
                    <div style={{ fontSize: 20, fontFamily: "'Space Mono', monospace", color: THEME.accent, fontWeight: 700, lineHeight: 1 }}>{c.valueElement || c.value}</div>
                    <div style={{ fontSize: 10, color: THEME.textSoft, marginTop: 5 }}>{c.subElement || c.sub}</div>
                  </div>
                ))}
              </div>

              {/* 24-hr wave forecast (full width) */}
              <div style={{ background: THEME.panel, borderRadius: 8, padding: "13px 16px", border: `1px solid ${THEME.border}`, marginBottom: 16 }}>
                <div style={{ fontSize: 8, letterSpacing: 3, color: THEME.muted, marginBottom: 14 }}>24-HR SURF FORECAST (FACE HEIGHT)</div>
                <WaveForecastChart
                  times={data.dayTimes}
                  heights={data.daySurfHeights ?? data.dayWaveHeights}
                  syncMs={syncMs}
                  onSyncHover={setSyncMs}
                />
              </div>

              {/* Tides */}
              <div style={{ background: THEME.panel, borderRadius: 8, padding: "13px 16px", border: `1px solid ${THEME.border}` }}>
                <div style={{ fontSize: 8, letterSpacing: 3, color: THEME.muted, marginBottom: 14 }}>
                  TIDES — NOAA {activeSpot.tideStationId} · {activeSpot.tideStationLabel}
                </div>
                <TideChart tides={spotTides} syncMs={syncMs} onSyncHover={setSyncMs} />
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
          ) : aiCalled ? (
            aiRec.text ? (
              <div
                style={{ fontSize: 12.5, lineHeight: 1.75, color: THEME.text }}
                dangerouslySetInnerHTML={{ __html: `<p style='margin:0'>${formatAI(aiRec.text)}</p>` }}
              />
            ) : (
              <div style={{ fontSize: 12, color: THEME.textSoft }}>
                AI recommendation unavailable.
              </div>
            )
          ) : (
            <div>
              <div style={{ fontSize: 12, color: THEME.textSoft, marginBottom: 14, lineHeight: 1.55 }}>
                Tap below to use Claude on the current conditions. You only get one AI call per session, so make it count.
              </div>
              <button
                onClick={onGenerateAi}
                style={{
                  width: "100%",
                  padding: "11px 0",
                  background: THEME.accent,
                  border: "none",
                  borderRadius: 6,
                  color: "#ffffff",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 2,
                  cursor: "pointer",
                  fontFamily: "'Space Mono', monospace",
                }}
              >
                GENERATE AI RECOMMENDATION
              </button>
            </div>
          )}

          {/* Divider + legend */}
          <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${THEME.border}` }}>
            <div style={{ fontSize: 8, letterSpacing: 3, color: THEME.textSoft, marginBottom: 12 }}>CONDITION KEY</div>
            {[
              { label: "Pumping", color: getRatingDisplayColor("Pumping"), desc: "Powerful, high-quality surf" },
              { label: "Good", color: getRatingDisplayColor("Good"), desc: "Consistently quality waves" },
              { label: "Decent", color: getRatingDisplayColor("Decent"), desc: "Rideable with some tradeoffs" },
              { label: "Bad", color: getRatingDisplayColor("Bad"), desc: "Marginal and inconsistent" },
              { label: "Poor", color: getRatingDisplayColor("Poor"), desc: "Unfavorable surf conditions" },
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
              Surf height is estimated from offshore swell, period, break type, and direction
              {` `}(face height). When available, conditions are blended with nearby <strong style={{ color: THEME.text }}>NDBC buoy</strong> readings.
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
  const [buoyByStation, setBuoyByStation] = useState({});
  const [spotRetryTick, setSpotRetryTick] = useState(0);
  const [tidesByStation, setTidesByStation] = useState({});
  const [activeSpot, setActiveSpot] = useState(SPOTS[0]);
  const [aiRec, setAiRec] = useState({ text: "", loading: false, retryAttempt: 1, maxAttempts: 1 });
  const [aiCalled, setAiCalled] = useState(false);
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
      return `${s.name} (${s.type}, ${s.difficulty}): ${fmtSurfFt(d.surfHeightFt)}ft, ${d.swellPeriod?.toFixed(0)}s swell from ${degToCompass(d.swellDir)}, wind ${d.windSpeed?.toFixed(0)}mph from ${degToCompass(d.windDir)}${d.forecastSource === "blend" ? ", NDBC blend" : ""}`;
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
      const ndbcIds = [...new Set(spots.map(s => getNdbcStationIdForSpot(s)))];
      const nextBuoyByStation = await fetchNdbcBuoysByStation(ndbcIds);
      const resolved = driveOriginResolved || await resolveAndAutofillDriveOrigin();
      const originForRouting = resolved ? `${resolved.lat},${resolved.lon}` : driveOrigin;
      const nextDriveTimes = await fetchDriveTimes(spots, originForRouting);
      const nextTidesByStation = {};
      uniqueTideIds.forEach((id, i) => {
        nextTidesByStation[id] = tideJsons[i]?.predictions || [];
      });

      const data = {};
      spots.forEach((spot, i) => {
        data[spot.id] = buildSpotCondition(spot, marines[i], winds[i], nextBuoyByStation);
      });

      setSpotData(data);
      setBuoyByStation(nextBuoyByStation);
      setSpotRetryTick(0);
      setDriveTimes(nextDriveTimes);
      setDriveRetryTick(0);
      setTidesByStation(nextTidesByStation);
      const topSpot = sortSpotsByScore(spots, data, nextTidesByStation, nextDriveTimes)[0];
      if (topSpot) setActiveSpot(topSpot);
      setScreen("dashboard");
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

    setAddSpotLoading(true);
    setAddSpotStatus("Generating spot config (Claude)…");
    try {
      const regionHint = (driveOrigin.trim() || "San Francisco Bay Area, California, USA");
      const generatedConfig = await fetchSurfSpotConfigFromAnthropic(name, regionHint);
      if (!generatedConfig) {
        setAddSpotStatus("Could not generate a full spot configuration. Try a more specific spot name.");
        return;
      }

      const dupByName = spots.some(s =>
        normalizeSpotName(s.name) === normalizeSpotName(generatedConfig.name)
      );
      // Coordinate-only duplicate checks were causing false positives for distinct breaks
      // when AI returned approximate lat/lon. Keep duplicate protection name-based.
      if (dupByName) {
        setAddSpotStatus("That spot already exists in your list.");
        return;
      }

      const cityDisplay = deriveCityFromPlaceOrLabel(generatedConfig.region, "Custom");
      const fallbackTideMeta = getNearestTideStationMeta(generatedConfig.latitude, generatedConfig.longitude);
      const fallbackBuoyMeta = getNearestBuoyMeta(generatedConfig.latitude, generatedConfig.longitude);
      if (!generatedConfig.ndbc_station_id) {
        generatedConfig.ndbc_station_id = fallbackBuoyMeta.ndbcStationId;
      }
      const tideStationId = generatedConfig.noaa_tide_station_id || fallbackTideMeta.tideStationId;
      const uniqueSpotIdBase = generatedConfig.id || createSpotId(generatedConfig.name);
      const uniqueSpotId = spots.some(s => s.id === uniqueSpotIdBase)
        ? `${uniqueSpotIdBase}_${Date.now().toString(36)}`
        : uniqueSpotIdBase;
      const nextSpot = {
        id: uniqueSpotId,
        name: generatedConfig.name,
        shortName: generatedConfig.name.length > 18 ? `${generatedConfig.name.slice(0, 18)}…` : generatedConfig.name,
        lat: generatedConfig.latitude,
        lon: generatedConfig.longitude,
        type: breakTypeKeyToDisplay(generatedConfig.break_type),
        difficulty: difficultyKeyToDisplay(generatedConfig.difficulty),
        city: cityDisplay,
        tideStationId,
        tideStationLabel: tideStationId === fallbackTideMeta.tideStationId
          ? fallbackTideMeta.tideStationLabel
          : `NOAA ${tideStationId}`,
        scoringConfig: generatedConfig,
      };
      const nextSpots = [...spots, nextSpot];

      setSpots(nextSpots);
      setActiveSpot(nextSpot);
      setAddSpotStatus(`Added ${nextSpot.name}. Fetching conditions...`);

      const ndbcId = generatedConfig.ndbc_station_id;
      let buoysForFetch = buoyByStation;
      if (ndbcId && !buoysForFetch[ndbcId]) {
        const obs = await fetchNdbcBuoyObservation(ndbcId);
        buoysForFetch = { ...buoysForFetch, [ndbcId]: obs };
        setBuoyByStation(buoysForFetch);
      }

      const condition = await fetchSpotCondition(nextSpot, buoysForFetch);
      if (condition) {
        setSpotData(prev => ({ ...prev, [nextSpot.id]: condition }));
      }

      const originForRouting = driveOriginResolved
        ? `${driveOriginResolved.lat},${driveOriginResolved.lon}`
        : driveOrigin;
      if (apiKey) {
        const drive = await fetchDriveTimes([nextSpot], originForRouting);
        if (drive?.[nextSpot.id]) {
          setDriveTimes(prev => ({ ...prev, [nextSpot.id]: drive[nextSpot.id] }));
        }
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
      const recovered = await fetchMissingSpotData(spots, spotData, buoyByStation);
      if (Object.keys(recovered).length) {
        setSpotData(prev => ({ ...prev, ...recovered }));
      }
      setSpotRetryTick(t => t + 1);
    }, 10000);

    return () => clearTimeout(timer);
  }, [screen, spotData, spotRetryTick, spots, buoyByStation]);

  useEffect(() => {
    if (!activeSpot || spots.some(s => s.id === activeSpot.id)) return;
    const topSpot = sortSpotsByScore(spots, spotData, tidesByStation, driveTimes)[0];
    setActiveSpot(topSpot || spots[0]);
  }, [spots, activeSpot, spotData, tidesByStation, driveTimes]);

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
      aiCalled={aiCalled}
      skill={skill} quiver={quiver}
      onGenerateAi={() => {
        if (aiCalled || aiRec.loading) return;
        setAiCalled(true);
        callAI(spotData, tidesByStation, spots);
      }}
      addSpotOpen={addSpotOpen} setAddSpotOpen={setAddSpotOpen}
      addSpotName={addSpotName} setAddSpotName={value => {
        setAddSpotName(value);
        setAddSpotStatus("");
      }}
      addSpotStatus={addSpotStatus} addSpotLoading={addSpotLoading}
      onAddSpot={handleAddSpot} />
  );
}
