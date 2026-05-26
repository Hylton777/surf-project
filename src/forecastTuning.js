/** Central tuning knobs for hourly surf height forecast adjustments. */

export const BUOY_ANCHOR_DECAY_HOURS = 6;
export const BUOY_RATIO_CLAMP = [0.6, 1.6];

/** mph → multiplier applied to face height (onshore tiers). */
export const ONSHORE_CHOP_TIERS = [
  { maxMph: 8, mult: 1 },
  { maxMph: 12, mult: 0.92 },
  { maxMph: 18, mult: 0.85 },
  { maxMph: Infinity, mult: 0.72 },
];

/** mph → multiplier (cross-shore). */
export const CROSSSHORE_CHOP_TIERS = [
  { maxMph: 10, mult: 1 },
  { maxMph: 15, mult: 0.95 },
  { maxMph: Infinity, mult: 0.88 },
];

export const TIDE_HEIGHT_MULT_MIN = 0.9;
export const TIDE_HEIGHT_MULT_MAX = 1;
