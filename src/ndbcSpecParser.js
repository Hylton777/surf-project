const COMPASS_TO_DEG = {
  N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
  S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
};

const parseNum = value => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const parseCompassDeg = value => {
  const key = String(value || "").trim().toUpperCase();
  if (key in COMPASS_TO_DEG) return COMPASS_TO_DEG[key];
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/**
 * Parse NDBC realtime2 .spec whitespace file; returns latest valid observation.
 * @param {string} text
 * @returns {{ hsM: number, swellHsM: number | null, periodS: number | null, directionDeg: number | null, observedAt: Date, ageMinutes: number } | null}
 */
export function parseNdbcSpecLatest(text) {
  const lines = String(text || "").split("\n");
  const dataLines = lines.filter(line => /^\d{4}\s/.test(line.trim()));
  if (!dataLines.length) return null;

  const latest = dataLines[0].trim().split(/\s+/);
  if (latest.length < 6) return null;

  const year = parseInt(latest[0], 10);
  const month = parseInt(latest[1], 10) - 1;
  const day = parseInt(latest[2], 10);
  const hour = parseInt(latest[3], 10);
  const minute = parseInt(latest[4], 10);
  const observedAt = new Date(year, month, day, hour, minute);
  if (Number.isNaN(observedAt.getTime())) return null;

  const hsM = parseNum(latest[5]);
  if (hsM == null || hsM < 0) return null;

  const swellHsM = latest.length > 6 ? parseNum(latest[6]) : null;
  const periodS = latest.length > 7 ? parseNum(latest[7]) : null;
  const mwdDeg = latest.length > 14 ? parseNum(latest[14]) : null;
  const swdDeg = latest.length > 10 ? parseCompassDeg(latest[10]) : null;

  const ageMinutes = Math.max(0, (Date.now() - observedAt.getTime()) / 60000);

  return {
    hsM,
    swellHsM,
    periodS,
    directionDeg: mwdDeg ?? swdDeg,
    observedAt,
    ageMinutes,
  };
}
