const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const _interpolate = (value, inMin, inMax, outMin, outMax) => {
  if (inMax === inMin) return outMax;
  const ratio = (value - inMin) / (inMax - inMin);
  return outMin + ratio * (outMax - outMin);
};

export const normalizeAngle = degrees => ((degrees % 360) + 360) % 360;

export const angularDifference = (a, b) => {
  const delta = Math.abs(normalizeAngle(a) - normalizeAngle(b));
  return Math.min(delta, 360 - delta);
};

export const getMinSwellDirectionDelta = (swellDirection, spotConfig) => {
  if (!Number.isFinite(swellDirection)) return null;
  const optimal = Array.isArray(spotConfig?.optimal_swell_directions)
    ? spotConfig.optimal_swell_directions
    : [];
  if (!optimal.length) return null;
  return optimal.reduce(
    (best, dir) => Math.min(best, angularDifference(swellDirection, dir)),
    Number.POSITIVE_INFINITY
  );
};

export const getDirectionScore = (swellDirection, spotConfig) => {
  const minDelta = getMinSwellDirectionDelta(swellDirection, spotConfig);
  if (minDelta == null) return 0;

  const baseTolerance = 30;
  const scale = Number.isFinite(spotConfig.swell_direction_tolerance)
    ? spotConfig.swell_direction_tolerance / baseTolerance
    : 1;

  const t1 = 15 * scale;
  const t2 = 30 * scale;
  const t3 = 45 * scale;
  const t4 = 60 * scale;

  if (minDelta <= t1) return 100;
  if (minDelta <= t2) return clamp(_interpolate(minDelta, t1, t2, 100, 80), 0, 100);
  if (minDelta <= t3) return clamp(_interpolate(minDelta, t2, t3, 80, 55), 0, 100);
  if (minDelta <= t4) return clamp(_interpolate(minDelta, t3, t4, 55, 30), 0, 100);
  return 0;
};

/** Map direction score bands to a surf-height attenuation factor (0–1). */
export const getDirectionAttenuation = (swellDirection, spotConfig) => {
  const score = getDirectionScore(swellDirection, spotConfig);
  if (score >= 100) return 1;
  if (score >= 80) return 0.85;
  if (score >= 55) return 0.6;
  if (score >= 30) return 0.35;
  if (score > 0) return 0.1;
  return 0.1;
};
