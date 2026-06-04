import { computeHourlySurfForecast, marineHourFromArrays } from "../forecast/surfForecast.js";
import { computeSurfScore } from "../forecast/surfScorer.js";

const TZ = "America/Los_Angeles";
const MPH_TO_KNOTS = 0.868976;

const MARINE_HOURLY =
  "wave_height,wave_period,wave_peak_period,wave_direction,swell_wave_height,swell_wave_period,swell_wave_peak_period,swell_wave_direction,secondary_swell_wave_height,secondary_swell_wave_period,secondary_swell_wave_direction,wind_wave_height,wind_wave_period,wind_wave_peak_period,wind_wave_direction";

export const todayInTimeZone = (timeZone = TZ) =>
  new Date().toLocaleDateString("en-CA", { timeZone });

const parseHourTimeMs = s => {
  const m = String(s || "").match(/(\d{4})-(\d{2})-(\d{2})[\sT](\d{2}):(\d{2})/);
  if (!m) return NaN;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
};

const parseTimeToMinutes = timeStr => {
  const m = String(timeStr || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
};

const alignHourIdx = (primaryTimes, secondaryTimes, hi) => {
  if (!primaryTimes?.length || !secondaryTimes?.length) return hi;
  const t = primaryTimes[hi];
  if (t == null) return Math.min(Math.max(0, hi), secondaryTimes.length - 1);
  const j = secondaryTimes.indexOf(t);
  return j !== -1 ? j : Math.min(Math.max(0, hi), secondaryTimes.length - 1);
};

const getTideAtTime = (predictions, ms) => {
  if (!Array.isArray(predictions) || !predictions.length || !Number.isFinite(ms)) return null;
  const events = predictions
    .map(p => ({ ts: new Date(p?.t).getTime(), v: Number(p?.v) }))
    .filter(e => Number.isFinite(e.ts) && Number.isFinite(e.v))
    .sort((a, b) => a.ts - b.ts);
  if (!events.length) return null;
  if (ms <= events[0].ts) return events[0].v;
  if (ms >= events[events.length - 1].ts) return events[events.length - 1].v;
  for (let i = 0; i < events.length - 1; i++) {
    const a = events[i];
    const b = events[i + 1];
    if (ms >= a.ts && ms <= b.ts) {
      const span = b.ts - a.ts;
      if (span <= 0) return a.v;
      return a.v + ((ms - a.ts) / span) * (b.v - a.v);
    }
  }
  return null;
};

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

const avg = nums => {
  const vals = nums.filter(n => Number.isFinite(n));
  if (!vals.length) return null;
  return vals.reduce((s, n) => s + n, 0) / vals.length;
};

const round1 = n => (Number.isFinite(n) ? Math.round(n * 10) / 10 : null);

export const fetchMarineForDate = (lat, lon, dateStr) =>
  fetch(
    `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&hourly=${MARINE_HOURLY}&start_date=${dateStr}&end_date=${dateStr}&timezone=${encodeURIComponent(TZ)}`
  ).then(r => r.json());

export const fetchWindForDate = (lat, lon, dateStr) =>
  fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=wind_speed_10m,wind_direction_10m&start_date=${dateStr}&end_date=${dateStr}&timezone=${encodeURIComponent(TZ)}&wind_speed_unit=mph`
  ).then(r => r.json());

export const fetchTidesForDate = (stationId, dateStr) => {
  const pad = n => String(n).padStart(2, "0");
  const d = new Date(`${dateStr}T12:00:00`);
  const t = new Date(d);
  t.setDate(t.getDate() + 1);
  const fmt = x => `${x.getFullYear()}${pad(x.getMonth() + 1)}${pad(x.getDate())}`;
  const begin = fmt(d);
  const end = fmt(t);
  return fetch(
    `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?begin_date=${begin}&end_date=${end}&station=${stationId}&product=predictions&datum=MLLW&time_zone=lst_ldt&interval=hilo&units=english&application=cs153&format=json`
  ).then(r => r.json());
};

const pointInSessionWindow = (timeStr, sessionDate, startTime, endTime) => {
  const startMin = parseTimeToMinutes(startTime);
  const endMin = parseTimeToMinutes(endTime);
  if (startMin == null || endMin == null) return false;
  const m = String(timeStr || "").match(/(\d{4})-(\d{2})-(\d{2})[\sT](\d{2}):(\d{2})/);
  if (!m || m[1] + "-" + m[2] + "-" + m[3] !== sessionDate) return false;
  const pointMin = Number(m[4]) * 60 + Number(m[5]);
  return pointMin >= startMin && pointMin <= endMin;
};

/**
 * Build forecast snapshot for a session window from marine/wind JSON.
 */
export function buildSessionForecastSnapshot({
  spot,
  spotConfig,
  marineJson,
  windJson,
  tidePredictions = [],
  sessionDate,
  startTime,
  endTime,
  source = "historical",
}) {
  if (!spotConfig || !marineJson?.hourly?.time?.length) return null;

  const hourly = [];
  const times = marineJson.hourly.time;

  for (let i = 0; i < times.length; i++) {
    const time = times[i];
    if (!pointInSessionWindow(time, sessionDate, startTime, endTime)) continue;

    const marineHour = marineHourFromArrays(marineJson.hourly, i);
    const ms = parseHourTimeMs(time);
    const tideFt = getTideAtTime(tidePredictions, ms);
    const windHour = windHourAtIndex(windJson, times, i);
    const forecast = computeHourlySurfForecast({
      marineHour,
      spotConfig,
      windHour,
      tideFt,
      buoyObservation: null,
      hourIndex: i,
      anchor: null,
      useBuoyForBase: false,
    });
    const { score, rating } = computeHourlySurfScore(spotConfig, forecast, windHour, tideFt);

    hourly.push({
      time,
      surfHeightFt: forecast.surfHeightFt,
      swellPeriod: forecast.swellPeriod,
      swellDir: forecast.swellDir,
      windSpeedMph: forecast.windSpeedMph,
      windClassification: forecast.windClassification,
      tideFt,
      score,
      rating,
    });
  }

  if (!hourly.length) return null;

  const avgSnapshot = {
    surfHeightFt: round1(avg(hourly.map(h => h.surfHeightFt))),
    swellPeriod: round1(avg(hourly.map(h => h.swellPeriod))),
    swellDir: round1(avg(hourly.map(h => h.swellDir))),
    windSpeedMph: round1(avg(hourly.map(h => h.windSpeedMph))),
    tideFt: round1(avg(hourly.map(h => h.tideFt))),
    score: round1(avg(hourly.map(h => h.score))),
    rating: hourly[Math.floor(hourly.length / 2)]?.rating || null,
    windClassification: hourly[Math.floor(hourly.length / 2)]?.windClassification || null,
  };

  return {
    sessionDate,
    startTime,
    endTime,
    timezone: TZ,
    spotId: spot.id,
    spotName: spot.name,
    source,
    capturedAt: new Date().toISOString(),
    avg: avgSnapshot,
    hourly,
  };
}

/** Use live dashboard spot data when session date is today. */
export function buildSnapshotFromSpotData({
  spot,
  spotData,
  sessionDate,
  startTime,
  endTime,
}) {
  const data = spotData?.[spot.id];
  const points = data?.dayForecastPoints || [];
  if (!points.length) return null;

  const hourly = points.filter(p =>
    pointInSessionWindow(p.time, sessionDate, startTime, endTime)
  );
  if (!hourly.length) return null;

  const avgSnapshot = {
    surfHeightFt: round1(avg(hourly.map(h => h.surfHeightFt))),
    swellPeriod: round1(avg(hourly.map(h => h.swellPeriod))),
    swellDir: round1(avg(hourly.map(h => h.swellDir))),
    windSpeedMph: round1(avg(hourly.map(h => h.windSpeedMph))),
    tideFt: round1(avg(hourly.map(h => h.tideFt))),
    score: round1(avg(hourly.map(h => h.score))),
    rating: hourly[Math.floor(hourly.length / 2)]?.rating || null,
    windClassification: hourly[Math.floor(hourly.length / 2)]?.windClassification || null,
  };

  return {
    sessionDate,
    startTime,
    endTime,
    timezone: TZ,
    spotId: spot.id,
    spotName: spot.name,
    source: "live",
    capturedAt: new Date().toISOString(),
    avg: avgSnapshot,
    hourly: hourly.map(h => ({
      time: h.time,
      surfHeightFt: h.surfHeightFt,
      swellPeriod: h.swellPeriod,
      swellDir: h.swellDir,
      windSpeedMph: h.windSpeedMph,
      windClassification: h.windClassification,
      tideFt: h.tideFt,
      score: h.score,
      rating: h.rating,
    })),
  };
}

/**
 * Resolve forecast snapshot for logging — live data for today, fetched archive otherwise.
 */
export async function resolveSessionForecastSnapshot({
  spot,
  spotConfig,
  spotData,
  sessionDate,
  startTime,
  endTime,
}) {
  const today = todayInTimeZone();
  if (sessionDate === today) {
    const live = buildSnapshotFromSpotData({ spot, spotData, sessionDate, startTime, endTime });
    if (live) return live;
  }

  const [marineJson, windJson, tideJson] = await Promise.all([
    fetchMarineForDate(spot.lat, spot.lon, sessionDate).catch(() => null),
    fetchWindForDate(spot.lat, spot.lon, sessionDate).catch(() => null),
    fetchTidesForDate(spot.tideStationId, sessionDate).catch(() => ({ predictions: [] })),
  ]);

  return buildSessionForecastSnapshot({
    spot,
    spotConfig,
    marineJson,
    windJson,
    tidePredictions: tideJson?.predictions || [],
    sessionDate,
    startTime,
    endTime,
    source: sessionDate === today ? "fetched" : "historical",
  });
}
