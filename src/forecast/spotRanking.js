import { MPH_TO_KNOTS } from "./userSpotConfig.js";
import { getNearestTideValue, getTideAtTime } from "./tideUtils.js";
import { parseHourTimeMs } from "../lib/forecastTime.js";
import { parseDriveTimeMinutes } from "../lib/drive.js";
import { computeSurfScore } from "./surfScorer.js";
import { getSpotScoringConfig } from "./spotRegistry.js";
import { buildSpotCondition } from "./buildSpotCondition.js";
import { sortSpotsWithPreferences } from "../sessions/sessionSimilarity.js";

export const computeDisplayScore = (spot, d, tidesByStation) => {
  if (!spot || !d) return null;
  const spotConfig = getSpotScoringConfig(spot);
  if (!spotConfig) return null;

  const tidePredictions = tidesByStation?.[spot.tideStationId];
  let tide = getNearestTideValue(tidePredictions);
  if (d.isForecastToday === false && d.forecastDate) {
    const refMs = parseHourTimeMs(`${d.forecastDate}T12:00`);
    const tideAtDay = getTideAtTime(tidePredictions, refMs);
    if (Number.isFinite(tideAtDay)) tide = tideAtDay;
  }

  const conditions = {
    swellHeight: Number.isFinite(d.surfHeightFt) ? d.surfHeightFt : 0,
    swellPeriod: Number.isFinite(d.swellPeriod) && d.swellPeriod > 0 ? d.swellPeriod : d.wavePeriod,
    swellDirection: Number.isFinite(d.swellDir) ? d.swellDir : d.waveDir,
    windSpeed: (Number(d.windSpeed) || 0) * MPH_TO_KNOTS,
    windDirection: Number(d.windDir) || 0,
    tide,
  };
  return computeSurfScore(conditions, spotConfig);
};

export const buildSpotDataMapForDate = (spotsList, rawBySpot, buoyState, tidesState, dateStr) => {
  const out = {};
  for (const spot of spotsList) {
    const raw = rawBySpot[spot.id];
    if (!raw?.marine?.hourly) continue;
    const built = buildSpotCondition(
      spot,
      raw.marine,
      raw.wind,
      buoyState,
      tidesState[spot.tideStationId] || [],
      dateStr
    );
    if (built) out[spot.id] = built;
  }
  return out;
};

export const sortSpotsByScore = (spots, spotData, tidesByStation, driveTimes) =>
  [...spots].sort((a, b) => {
    const aScore = computeDisplayScore(a, spotData[a.id], tidesByStation)?.score ?? -1;
    const bScore = computeDisplayScore(b, spotData[b.id], tidesByStation)?.score ?? -1;
    if (bScore !== aScore) return bScore - aScore;
    const aDrive = parseDriveTimeMinutes(driveTimes[a.id]);
    const bDrive = parseDriveTimeMinutes(driveTimes[b.id]);
    if (aDrive !== bDrive) return aDrive - bDrive;
    return a.shortName.localeCompare(b.shortName);
  });

export const rankSpots = (spots, spotData, tidesByStation, driveTimes, surfSessions = []) => {
  if (surfSessions?.length) {
    return sortSpotsWithPreferences({
      spots,
      spotData,
      tidesByStation,
      driveTimes,
      sessions: surfSessions,
      computeDisplayScore,
      parseDriveTimeMinutes,
    });
  }
  return sortSpotsByScore(spots, spotData, tidesByStation, driveTimes);
};
