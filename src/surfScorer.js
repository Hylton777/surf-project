import { DEFAULT_WEIGHTS } from "../surfSpotConfigs.js";

const COMPONENT_KEYS = ["height", "period", "direction", "wind", "tide"];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const normalizeAngle = degrees => ((degrees % 360) + 360) % 360;

const angularDifference = (a, b) => {
  const delta = Math.abs(normalizeAngle(a) - normalizeAngle(b));
  return Math.min(delta, 360 - delta);
};

const interpolate = (value, inMin, inMax, outMin, outMax) => {
  if (inMax === inMin) return outMax;
  const ratio = (value - inMin) / (inMax - inMin);
  return outMin + ratio * (outMax - outMin);
};

const getHeightScore = (swellHeight, spotConfig) => {
  const {
    min_rideable_ft: minRideable,
    optimal_height_min_ft: optimalMin,
    optimal_height_max_ft: optimalMax,
    max_rideable_ft: maxRideable,
  } = spotConfig;

  if (!Number.isFinite(swellHeight)) return 0;
  if (swellHeight < minRideable) return 0;
  if (swellHeight <= optimalMin) {
    return clamp(interpolate(swellHeight, minRideable, optimalMin, 0, 100), 0, 100);
  }
  if (swellHeight <= optimalMax) return 100;
  if (swellHeight <= maxRideable) {
    return clamp(interpolate(swellHeight, optimalMax, maxRideable, 100, 20), 20, 100);
  }
  return 0;
};

export const getPeriodScore = (swellPeriod, minPeriod = 8) => {
  if (!Number.isFinite(swellPeriod)) return 0;
  const min = Number.isFinite(minPeriod) ? minPeriod : 8;

  if (swellPeriod >= min + 8) return 100;
  if (swellPeriod >= min + 5) return 95;
  if (swellPeriod >= min + 2) return 85;
  if (swellPeriod >= min) return 70;
  if (swellPeriod >= min - 1) return 55;
  if (swellPeriod >= min - 2) return 35;
  if (swellPeriod >= min - 4) return 15;
  return 0;
};

export const getPeriodDeficitMultiplier = (period, minPeriod) => {
  if (!Number.isFinite(period) || !Number.isFinite(minPeriod)) return 1;
  if (period >= minPeriod) return 1;
  const deficit = minPeriod - period;
  if (deficit <= 1) return 0.85;
  if (deficit <= 2) return 0.7;
  if (deficit <= 4) return 0.5;
  return 0.3;
};

const getDirectionScore = (swellDirection, spotConfig) => {
  if (!Number.isFinite(swellDirection)) return 0;
  const optimal = Array.isArray(spotConfig.optimal_swell_directions)
    ? spotConfig.optimal_swell_directions
    : [];
  if (!optimal.length) return 0;

  const minDelta = optimal.reduce(
    (best, dir) => Math.min(best, angularDifference(swellDirection, dir)),
    Number.POSITIVE_INFINITY
  );

  const baseTolerance = 30;
  const scale = Number.isFinite(spotConfig.swell_direction_tolerance)
    ? spotConfig.swell_direction_tolerance / baseTolerance
    : 1;

  const t1 = 15 * scale;
  const t2 = 30 * scale;
  const t3 = 45 * scale;
  const t4 = 60 * scale;

  if (minDelta <= t1) return 100;
  if (minDelta <= t2) return clamp(interpolate(minDelta, t1, t2, 100, 80), 0, 100);
  if (minDelta <= t3) return clamp(interpolate(minDelta, t2, t3, 80, 55), 0, 100);
  if (minDelta <= t4) return clamp(interpolate(minDelta, t3, t4, 55, 30), 0, 100);
  return 0;
};

const classifyWind = (windDirection, breakFacingDirection) => {
  if (!Number.isFinite(windDirection) || !Number.isFinite(breakFacingDirection)) return "cross-shore";
  let windAngle = (windDirection - breakFacingDirection + 360) % 360;
  if (windAngle > 180) windAngle -= 360;
  if (Math.abs(windAngle - 180) <= 30 || Math.abs(windAngle + 180) <= 30) return "offshore";
  if (Math.abs(windAngle) <= 30) return "onshore";
  return "cross-shore";
};

const getWindScore = (windSpeed, windClassification) => {
  if (!Number.isFinite(windSpeed)) return 0;

  if (windClassification === "offshore") {
    if (windSpeed <= 5) return 100;
    if (windSpeed <= 10) return 95;
    if (windSpeed <= 15) return 85;
    if (windSpeed <= 20) return 65;
    return 40;
  }

  if (windClassification === "cross-shore") {
    if (windSpeed <= 5) return 75;
    if (windSpeed <= 10) return 55;
    if (windSpeed <= 15) return 35;
    return 15;
  }

  if (windSpeed <= 5) return 60;
  if (windSpeed <= 10) return 35;
  if (windSpeed <= 15) return 15;
  return 0;
};

const getTideScore = (tide, spotConfig) => {
  if (!Number.isFinite(tide)) return null;
  const [minTide, maxTide] = Array.isArray(spotConfig.optimal_tide_range_ft)
    ? spotConfig.optimal_tide_range_ft
    : [null, null];
  if (!Number.isFinite(minTide) || !Number.isFinite(maxTide)) return null;

  if (tide >= minTide && tide <= maxTide) return 100;
  const distanceOutside = tide < minTide ? minTide - tide : tide - maxTide;
  if (distanceOutside <= 0.5) return 70;
  if (distanceOutside <= 1) return 40;
  return 15;
};

const HEIGHT_WEIGHT_REDUCTION = 0.05;
const NON_HEIGHT_WEIGHT_KEYS = ["period", "direction", "wind", "tide"];

export const reduceHeightWeight = weights => {
  const height = Number(weights.height) || 0;
  if (height <= 0) return { ...weights };

  const reduction = Math.min(HEIGHT_WEIGHT_REDUCTION, height);
  const otherTotal = NON_HEIGHT_WEIGHT_KEYS.reduce(
    (sum, key) => sum + (Number(weights[key]) || 0),
    0
  );
  if (otherTotal <= 0) {
    return { ...weights, height: height - reduction };
  }

  const next = { ...weights, height: height - reduction };
  for (const key of NON_HEIGHT_WEIGHT_KEYS) {
    const value = Number(weights[key]) || 0;
    next[key] = value + reduction * (value / otherTotal);
  }
  return next;
};

export const getWeights = spotConfig => {
  const weights = { ...DEFAULT_WEIGHTS, ...(spotConfig?.weights || {}) };
  const merged = {
    height: Number(weights.height) || 0,
    period: Number(weights.period) || 0,
    direction: Number(weights.direction) || 0,
    wind: Number(weights.wind) || 0,
    tide: Number(weights.tide) || 0,
  };
  if (spotConfig?.isUserAdded) {
    return reduceHeightWeight(merged);
  }
  return merged;
};

const applyHardOverrides = (score, rating, breakdown, conditions, spotConfig) => {
  let nextScore = score;
  let nextRating = rating;

  if (conditions.swellHeight < spotConfig.min_rideable_ft) {
    return { score: 5, rating: "Poor" };
  }
  if (conditions.swellHeight > spotConfig.max_rideable_ft) {
    return { score: 10, rating: "Poor" };
  }
  if (conditions.swellPeriod < spotConfig.min_period_s) {
    nextScore *= getPeriodDeficitMultiplier(conditions.swellPeriod, spotConfig.min_period_s);
  }
  if (breakdown.directionScore === 0) {
    nextScore = Math.min(nextScore, 25);
  }
  if (conditions.windSpeed > 30 && breakdown.windClassification === "onshore") {
    nextScore = Math.min(nextScore, 20);
  }

  nextScore = clamp(Math.round(nextScore), 0, 100);
  nextRating = getRatingFromScore(nextScore);
  return { score: nextScore, rating: nextRating };
};

export const getRatingFromScore = score => {
  if (score >= 85) return "Pumping";
  if (score >= 65) return "Good";
  if (score >= 45) return "Decent";
  if (score >= 25) return "Bad";
  return "Poor";
};

export function computeSurfScore(conditions, spotConfig) {
  const windClassification = classifyWind(conditions.windDirection, spotConfig.break_facing_direction);

  const breakdown = {
    heightScore: Math.round(getHeightScore(conditions.swellHeight, spotConfig)),
    periodScore: Math.round(getPeriodScore(conditions.swellPeriod, spotConfig.min_period_s)),
    directionScore: Math.round(getDirectionScore(conditions.swellDirection, spotConfig)),
    windScore: Math.round(getWindScore(conditions.windSpeed, windClassification)),
    tideScore: getTideScore(conditions.tide, spotConfig),
    windClassification,
  };

  const weights = getWeights(spotConfig);
  const weightedParts = COMPONENT_KEYS.filter(key => {
    if (key !== "tide") return true;
    return breakdown.tideScore != null;
  });

  const componentScoreMap = {
    height: breakdown.heightScore,
    period: breakdown.periodScore,
    direction: breakdown.directionScore,
    wind: breakdown.windScore,
    tide: breakdown.tideScore == null ? 0 : breakdown.tideScore,
  };

  const activeWeightTotal = weightedParts.reduce((sum, key) => sum + weights[key], 0) || 1;
  const weightedScore =
    weightedParts.reduce((sum, key) => sum + componentScoreMap[key] * weights[key], 0) / activeWeightTotal;

  if (spotConfig.id === "mavericks" && conditions.swellHeight < 15) {
    return { score: 0, rating: "Dormant", breakdown };
  }

  const roundedScore = clamp(Math.round(weightedScore), 0, 100);
  const baseRating = getRatingFromScore(roundedScore);
  const overridden = applyHardOverrides(roundedScore, baseRating, breakdown, conditions, spotConfig);

  return {
    score: overridden.score,
    rating: overridden.rating,
    breakdown,
  };
}
