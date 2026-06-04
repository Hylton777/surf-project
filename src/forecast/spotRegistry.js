import { DEFAULT_NDBC_STATION_ID } from "../data/spotConfigs.js";
import { SPOTS } from "../data/defaultSpots.js";
import { LEGACY_SPOT_CONFIG_ID, SPOT_CONFIG_BY_ID } from "../data/legacySpotMap.js";

const REFERENCE_STATION_MAX_DEG = 2.5;

const distanceDeg = (lat1, lon1, lat2, lon2) => {
  const dLat = lat1 - lat2;
  const dLon = lon1 - lon2;
  return Math.sqrt(dLat * dLat + dLon * dLon);
};

const deriveRegionHintFromSpotName = (spotName, fallback = "") => {
  const parts = String(spotName || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  if (parts.length >= 2) return parts.slice(1).join(", ");
  return fallback;
};

const getNearestTideStationMeta = (lat, lon) => {
  const nearest = SPOTS.reduce((best, s) => {
    const dLat = s.lat - lat;
    const dLon = s.lon - lon;
    const score = dLat * dLat + dLon * dLon;
    if (!best || score < best.score) return { score, spot: s };
    return best;
  }, null);
  if (
    !nearest?.spot ||
    distanceDeg(lat, lon, nearest.spot.lat, nearest.spot.lon) > REFERENCE_STATION_MAX_DEG
  ) {
    return { tideStationId: null, tideStationLabel: null };
  }
  return {
    tideStationId: nearest.spot.tideStationId,
    tideStationLabel: nearest.spot.tideStationLabel,
  };
};

const getSpotScoringConfig = spot => {
  const configId = LEGACY_SPOT_CONFIG_ID[spot.id];
  return spot.scoringConfig || (configId ? SPOT_CONFIG_BY_ID[configId] : null);
};

const getNdbcStationIdForSpot = spot => {
  const cfg = getSpotScoringConfig(spot);
  if (cfg?.ndbc_station_id) return cfg.ndbc_station_id;
  if (cfg?.isUserAdded) return null;
  return DEFAULT_NDBC_STATION_ID;
};

const getNearestBuoyMeta = (lat, lon) => {
  const nearest = SPOTS.reduce((best, s) => {
    const dLat = s.lat - lat;
    const dLon = s.lon - lon;
    const score = dLat * dLat + dLon * dLon;
    if (!best || score < best.score) return { score, spot: s };
    return best;
  }, null);
  if (
    !nearest?.spot ||
    distanceDeg(lat, lon, nearest.spot.lat, nearest.spot.lon) > REFERENCE_STATION_MAX_DEG
  ) {
    return { ndbcStationId: null };
  }
  return { ndbcStationId: getNdbcStationIdForSpot(nearest.spot) };
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

export {
  REFERENCE_STATION_MAX_DEG,
  deriveRegionHintFromSpotName,
  getNearestTideStationMeta,
  getSpotScoringConfig,
  getNdbcStationIdForSpot,
  getNearestBuoyMeta,
  buoyObservationForBlend,
};

