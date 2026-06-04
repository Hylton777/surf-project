import { calibrateSpotConfigFromMarine, computeHourlySurfForecast, marineHourFromArrays } from "./surfForecast.js";
import { computeSurfScore } from "./surfScorer.js";
import { alignHourIdx, getCurrentHourIdx, parseHourTimeMs } from "../lib/forecastTime.js";
import { MPH_TO_KNOTS } from "./userSpotConfig.js";
import { getTideAtTime } from "./tideUtils.js";
import {
  getSpotScoringConfig,
  getNdbcStationIdForSpot,
  buoyObservationForBlend,
} from "./spotRegistry.js";
import { todayForecastDate, fetchMarine, fetchWind } from "../services/openMeteo.js";

const windHourAtIndex = (windJson, marineTimes, i) => {
  const wi = alignHourIdx(marineTimes, windJson?.hourly?.time, i);
  const speedMph = windJson?.hourly?.wind_speed_10m?.[wi];
  const directionDeg = windJson?.hourly?.wind_direction_10m?.[wi];
  return {
    speedMph: Number.isFinite(Number(speedMph)) ? Number(speedMph) : null,
    directionDeg: Number.isFinite(Number(directionDeg)) ? Number(directionDeg) : null,
  };
};

const computeHourlySurfScore = (spotConfig, forecastPoint, windHour, tideFt) => {
  const windSpeedKts = (Number(windHour?.speedMph) || 0) * MPH_TO_KNOTS;
  return computeSurfScore(
    {
      swellHeight: forecastPoint.surfHeightFt,
      swellPeriod: forecastPoint.swellPeriod,
      swellDirection: forecastPoint.swellDir,
      windSpeed: windSpeedKts,
      windDirection: Number(windHour?.directionDeg) || 0,
      tide: tideFt,
    },
    spotConfig
  );
};
const forecastHourAtIndex = (
  marineJson,
  spotConfig,
  buoyObservation,
  windJson,
  tidePredictions,
  i,
  anchor,
  { useBuoyForBase = false } = {}
) => {
  const marineHour = marineHourFromArrays(marineJson.hourly, i);
  const timeStr = marineJson.hourly.time?.[i];
  const ms = parseHourTimeMs(timeStr);
  const tideFt = getTideAtTime(tidePredictions, ms);
  const windHour = windHourAtIndex(windJson, marineJson.hourly.time, i);
  return computeHourlySurfForecast({
    marineHour,
    spotConfig,
    windHour,
    tideFt,
    buoyObservation,
    hourIndex: i,
    anchor,
    useBuoyForBase,
  });
};

const buildForecastHeightSeries = (
  marineJson,
  spotConfig,
  buoyObservation,
  windJson,
  tidePredictions,
  startIdx,
  count,
  anchor
) => {
  const len = marineJson?.hourly?.time?.length || 0;
  const series = [];
  for (let i = startIdx; i < startIdx + count && i < len; i++) {
    series.push(
      forecastHourAtIndex(
        marineJson,
        spotConfig,
        buoyObservation,
        windJson,
        tidePredictions,
        i,
        anchor
      ).surfHeightFt
    );
  }
  return series;
};

const buildDayForecastPoints = (
  marineJson,
  spotConfig,
  buoyObservation,
  windJson,
  tidePredictions,
  dayStartIdx,
  dayTimes,
  hi
) => {
  const anchorModel = forecastHourAtIndex(
    marineJson,
    spotConfig,
    buoyObservation,
    windJson,
    tidePredictions,
    hi,
    null
  );
  const anchorBuoy = forecastHourAtIndex(
    marineJson,
    spotConfig,
    buoyObservation,
    windJson,
    tidePredictions,
    hi,
    null,
    { useBuoyForBase: true }
  );
  const anchor = {
    index: hi,
    surfHeightFt: anchorBuoy.surfHeightFt,
    modelSurfHeightFt: anchorModel.surfHeightFt,
  };

  const points = [];
  const len = marineJson?.hourly?.time?.length || 0;
  for (let j = 0; j < dayTimes.length && dayStartIdx + j < len; j++) {
    const i = dayStartIdx + j;
    const time = dayTimes[j];
    const ms = parseHourTimeMs(time);
    const tideFt = getTideAtTime(tidePredictions, ms);
    const windHour = windHourAtIndex(windJson, marineJson.hourly.time, i);
    const forecast = forecastHourAtIndex(
      marineJson,
      spotConfig,
      buoyObservation,
      windJson,
      tidePredictions,
      i,
      anchor
    );
    const { score, rating } = computeHourlySurfScore(spotConfig, forecast, windHour, tideFt);
    points.push({
      time,
      ms: Number.isFinite(ms) ? ms : parseHourTimeMs(marineJson.hourly.time[i]),
      surfHeightFt: forecast.surfHeightFt,
      swellPeriod: forecast.swellPeriod,
      swellDir: forecast.swellDir,
      source: forecast.heightSource || forecast.source,
      score,
      rating,
      windSpeedMph: forecast.windSpeedMph,
      windClassification: forecast.windClassification,
      tideFt: Number.isFinite(forecast.tideFt) ? forecast.tideFt : tideFt,
    });
  }
  return { points, anchor, anchorBuoy };
};
const buildSpotCondition = (
  spot,
  marineJson,
  windJson,
  buoyByStation = {},
  tidePredictions = [],
  forecastDate = null
) => {
  if (!marineJson?.hourly) return null;
  const baseSpotConfig = getSpotScoringConfig(spot);
  if (!baseSpotConfig) return null;
  const spotConfig = baseSpotConfig.isUserAdded
    ? calibrateSpotConfigFromMarine(baseSpotConfig, marineJson.hourly)
    : baseSpotConfig;

  const today = todayForecastDate();
  const targetDate = forecastDate || today;
  const isToday = targetDate === today;

  const ndbcId = getNdbcStationIdForSpot(spot);
  const buoyObservation = isToday && ndbcId
    ? buoyObservationForBlend(buoyByStation[ndbcId])
    : null;

  const hourlyTimes = marineJson.hourly.time || [];
  let dayStartIdx = hourlyTimes.findIndex(t => typeof t === "string" && t.startsWith(targetDate));
  if (dayStartIdx < 0) return null;

  const dayTimes = hourlyTimes.slice(dayStartIdx, dayStartIdx + 24);
  if (!dayTimes.length) return null;

  const nowHi = getCurrentHourIdx(hourlyTimes);
  const anchorHi = isToday ? nowHi : Math.min(dayStartIdx + 12, hourlyTimes.length - 1);
  const wi = alignHourIdx(hourlyTimes, windJson?.hourly?.time, anchorHi);
  const sl = (arr, start, n = 12) => (arr || []).slice(start, start + n);

  const { points: dayForecastPoints, anchor, anchorBuoy } = buildDayForecastPoints(
    marineJson,
    spotConfig,
    buoyObservation,
    windJson,
    tidePredictions,
    dayStartIdx,
    dayTimes,
    anchorHi
  );
  const daySurfHeights = dayForecastPoints.map(p => p.surfHeightFt);
  const currentForecast = anchorBuoy;
  const forecastStartIdx = isToday ? nowHi : dayStartIdx;
  const forecastSurf = buildForecastHeightSeries(
    marineJson,
    spotConfig,
    buoyObservation,
    windJson,
    tidePredictions,
    forecastStartIdx,
    12,
    anchor
  );

  return {
    waveHeight: marineJson.hourly.wave_height?.[anchorHi] ?? 0,
    wavePeriod: marineJson.hourly.wave_period?.[anchorHi] ?? 0,
    waveDir: marineJson.hourly.wave_direction?.[anchorHi] ?? 0,
    swellHeight: marineJson.hourly.swell_wave_height?.[anchorHi] ?? 0,
    swellPeriod: currentForecast.swellPeriod,
    swellDir: currentForecast.swellDir ?? marineJson.hourly.swell_wave_direction?.[anchorHi] ?? 0,
    windWaveHeight: marineJson.hourly.wind_wave_height?.[anchorHi] ?? 0,
    windSpeed: windJson?.hourly?.wind_speed_10m?.[wi] ?? 0,
    windDir: windJson?.hourly?.wind_direction_10m?.[wi] ?? 0,
    surfHeightFt: currentForecast.surfHeightFt,
    surfHeightDescriptor: currentForecast.descriptor,
    swellHsFt: currentForecast.swellHsFt,
    forecastSource: isToday ? (currentForecast.source || "model") : "model",
    buoyHsFt: isToday ? currentForecast.buoyHsFt : null,
    buoyAgeMinutes: isToday ? currentForecast.buoyAgeMinutes : null,
    ndbcStationId: ndbcId,
    times: sl(marineJson.hourly.time, forecastStartIdx),
    forecastWave: forecastSurf,
    forecastWind: sl(windJson?.hourly?.wind_speed_10m, wi),
    dayTimes,
    dayWaveHeights: daySurfHeights,
    daySurfHeights,
    dayForecastPoints,
    forecastDate: targetDate,
    isForecastToday: isToday,
  };
};

const fetchSpotCondition = async (spot, buoyByStation = {}, tidePredictions = [], forecastDate = null) => {
  try {
    const marine = await fetchMarine(spot.lat, spot.lon).catch(() => null);
    if (!marine?.hourly) return null;
    const lat = marine?.latitude ?? spot.lat;
    const lon = marine?.longitude ?? spot.lon;
    const wind = await fetchWind(lat, lon).catch(() => null);
    return buildSpotCondition(spot, marine, wind, buoyByStation, tidePredictions, forecastDate);
  } catch {
    return null;
  }
};

const fetchSpotForecastBundle = async (spot, buoyByStation = {}, tidePredictions = [], forecastDate = null) => {
  try {
    const marine = await fetchMarine(spot.lat, spot.lon).catch(() => null);
    if (!marine?.hourly) return null;
    const lat = marine?.latitude ?? spot.lat;
    const lon = marine?.longitude ?? spot.lon;
    const wind = await fetchWind(lat, lon).catch(() => null);
    const condition = buildSpotCondition(spot, marine, wind, buoyByStation, tidePredictions, forecastDate);
    if (!condition) return null;
    return { marine, wind, condition };
  } catch {
    return null;
  }
};

const fetchMissingSpotData = async (
  spotsList,
  existingSpotData = {},
  buoyState = {},
  tidesState = {},
  dateStr = null
) => {
  const missing = spotsList.filter(s => !existingSpotData[s.id]);
  if (!missing.length) return { spotData: {}, rawBySpot: {} };
  const targetDate = dateStr || todayForecastDate();
  const pairs = await Promise.all(
    missing.map(async spot => {
      const bundle = await fetchSpotForecastBundle(
        spot,
        buoyState,
        tidesState[spot.tideStationId] || [],
        targetDate
      );
      return [spot.id, bundle];
    })
  );
  const spotData = {};
  const rawBySpot = {};
  for (const [id, bundle] of pairs) {
    if (!bundle) continue;
    spotData[id] = bundle.condition;
    rawBySpot[id] = { marine: bundle.marine, wind: bundle.wind };
  }
  return { spotData, rawBySpot };
};

export {
  windHourAtIndex,
  computeHourlySurfScore,
  forecastHourAtIndex,
  buildForecastHeightSeries,
  buildDayForecastPoints,
  buildSpotCondition,
  fetchSpotCondition,
  fetchSpotForecastBundle,
  fetchMissingSpotData,
};

