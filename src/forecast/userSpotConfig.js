import {
  DEFAULT_WEIGHTS,
  getDefaultSurfHeightScale,
  getDefaultSurfPeriodScale,
} from "../data/spotConfigs.js";
import { deriveCityFromPlaceOrLabel } from "../lib/format.js";
import { parseJsonObjectFromText, toSlug } from "../lib/json.js";

const MPH_TO_KNOTS = 0.868976;
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
export {
  MPH_TO_KNOTS,
  normalizeConfidence,
  normalizeBreakTypeKey,
  normalizeDifficultyKey,
  breakTypeKeyToDisplay,
  difficultyKeyToDisplay,
  normalizeWeightsToUnitSum,
  normalizeGeneratedSpotConfig,
};

