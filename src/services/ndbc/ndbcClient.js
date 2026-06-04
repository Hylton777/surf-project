import { parseNdbcSpecLatest } from "./ndbcSpecParser.js";

/**
 * Fetch latest NDBC spectral summary via app proxy (/api/ndbc/:id/spec).
 * @param {string} stationId
 * @returns {Promise<{ hsM: number, ageMinutes: number, swellHsM: number | null, periodS: number | null, directionDeg: number | null } | null>}
 */
export async function fetchNdbcBuoyObservation(stationId) {
  const id = String(stationId || "").replace(/\D/g, "");
  if (!id) return null;
  try {
    const res = await fetch(`/api/ndbc/${id}/spec`);
    if (!res.ok) return null;
    const text = await res.text();
    const parsed = parseNdbcSpecLatest(text);
    if (!parsed) return null;
    return {
      hsM: parsed.hsM,
      ageMinutes: parsed.ageMinutes,
      swellHsM: parsed.swellHsM,
      periodS: parsed.periodS,
      directionDeg: parsed.directionDeg,
    };
  } catch {
    return null;
  }
}

/**
 * @param {string[]} stationIds
 * @returns {Promise<Record<string, { hsM: number, ageMinutes: number } | null>>}
 */
export async function fetchNdbcBuoysByStation(stationIds) {
  const unique = [...new Set(stationIds.filter(Boolean))];
  const pairs = await Promise.all(
    unique.map(async id => [id, await fetchNdbcBuoyObservation(id)])
  );
  return Object.fromEntries(pairs);
}
