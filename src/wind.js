/**
 * Wind classification relative to break facing (shared by scorer and forecast).
 * @param {number} windDirection degrees from
 * @param {number} breakFacingDirection degrees break faces toward ocean
 * @returns {"offshore" | "onshore" | "cross-shore"}
 */
export const classifyWind = (windDirection, breakFacingDirection) => {
  if (!Number.isFinite(windDirection) || !Number.isFinite(breakFacingDirection)) {
    return "cross-shore";
  }
  let windAngle = (windDirection - breakFacingDirection + 360) % 360;
  if (windAngle > 180) windAngle -= 360;
  if (Math.abs(windAngle - 180) <= 30 || Math.abs(windAngle + 180) <= 30) return "offshore";
  if (Math.abs(windAngle) <= 30) return "onshore";
  return "cross-shore";
};
