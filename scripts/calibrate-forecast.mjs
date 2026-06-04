#!/usr/bin/env node
/**
 * Compare model-only vs buoy vs anchored face height at "now" for built-in spots.
 * Run: node scripts/calibrate-forecast.mjs
 */
import { SPOT_CONFIGS } from "../src/data/spotConfigs.js";
import { parseNdbcSpecLatest } from "../src/services/ndbc/ndbcSpecParser.js";
import {
  computeHourlySurfForecast,
  computeSurfHeightForecast,
  marineHourFromArrays,
} from "../src/forecast/surfForecast.js";

const MARINE_HOURLY =
  "wave_height,wave_period,wave_peak_period,wave_direction,swell_wave_height,swell_wave_period,swell_wave_peak_period,swell_wave_direction,secondary_swell_wave_height,secondary_swell_wave_period,secondary_swell_wave_direction";

const getCurrentHourIdx = times => {
  const now = Date.now();
  let idx = 0;
  for (let i = 0; i < times.length; i++) {
    if (new Date(times[i]).getTime() <= now) idx = i;
    else break;
  }
  return idx;
};

const fetchMarine = (lat, lon) =>
  fetch(
    `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&hourly=${MARINE_HOURLY}&past_days=1&forecast_days=1&timezone=America%2FLos_Angeles`
  ).then(r => r.json());

const fetchBuoy = async stationId => {
  const id = String(stationId || "").replace(/\D/g, "");
  if (!id) return null;
  const res = await fetch(`https://www.ndbc.noaa.gov/data/realtime2/${id}.spec`);
  if (!res.ok) return null;
  const parsed = parseNdbcSpecLatest(await res.text());
  if (!parsed) return null;
  return {
    hsM: parsed.hsM,
    swellHsM: parsed.swellHsM,
    periodS: parsed.periodS,
    directionDeg: parsed.directionDeg,
    ageMinutes: parsed.ageMinutes,
  };
};

const pct = (a, b) => (b ? ((a - b) / b) * 100 : NaN);
const fmtPct = v => (v == null || !Number.isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`);

async function calibrateSpot(cfg) {
  const marine = await fetchMarine(cfg.latitude, cfg.longitude).catch(() => null);
  if (!marine?.hourly?.time?.length) {
    return { id: cfg.id, error: "no marine" };
  }
  const hi = getCurrentHourIdx(marine.hourly.time);
  const marineHour = marineHourFromArrays(marine.hourly, hi);
  const buoy = cfg.ndbc_station_id ? await fetchBuoy(cfg.ndbc_station_id) : null;

  const modelOnly = computeSurfHeightForecast({
    marineHour,
    spotConfig: cfg,
    buoyObservation: null,
  });
  const buoyBlend = buoy
    ? computeSurfHeightForecast({ marineHour, spotConfig: cfg, buoyObservation: buoy })
    : null;

  const modelHourly = computeHourlySurfForecast({
    marineHour,
    spotConfig: cfg,
    hourIndex: hi,
    buoyObservation: null,
  });
  const anchored = buoy
    ? computeHourlySurfForecast({
        marineHour,
        spotConfig: cfg,
        hourIndex: hi,
        buoyObservation: buoy,
        anchor: {
          index: hi,
          surfHeightFt: buoyBlend.surfHeightFt,
          modelSurfHeightFt: modelHourly.surfHeightFt,
        },
      })
    : null;

  const buoyFt = buoyBlend?.surfHeightFt;
  const modelFt = modelOnly.surfHeightFt;

  return {
    id: cfg.id,
    name: cfg.name,
    scale: cfg.surf_height_scale,
    modelFt,
    buoyFt: buoyFt ?? null,
    anchoredFt: anchored?.surfHeightFt ?? null,
    modelVsBuoyPct: buoyFt != null ? pct(modelFt, buoyFt) : null,
    anchoredVsBuoyPct: buoyFt != null && anchored ? pct(anchored.surfHeightFt, buoyFt) : null,
  };
}

const rows = await Promise.all(SPOT_CONFIGS.map(calibrateSpot));

console.log("\nForecast calibration — model vs NDBC at current hour\n");
console.log(
  "spot".padEnd(28),
  "scale",
  "model",
  "buoy",
  "anchored",
  "modelΔ%",
  "anchorΔ%"
);
console.log("-".repeat(88));

for (const r of rows) {
  if (r.error) {
    console.log(r.id.padEnd(28), r.error);
    continue;
  }
  const fmt = v => (v == null ? "—" : v.toFixed(1));
  const fmtPct = v => (v == null || !Number.isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`);
  console.log(
    r.name.slice(0, 27).padEnd(28),
    String(r.scale ?? "—").padStart(5),
    fmt(r.modelFt).padStart(6),
    fmt(r.buoyFt).padStart(6),
    fmt(r.anchoredFt).padStart(8),
    fmtPct(r.modelVsBuoyPct).padStart(8),
    fmtPct(r.anchoredVsBuoyPct).padStart(9)
  );
}

const biased = rows.filter(
  r => r.modelVsBuoyPct != null && Math.abs(r.modelVsBuoyPct) > 15
);
if (biased.length) {
  console.log("\nSpots with |model vs buoy| > 15% — consider surf_height_scale tweak:");
  for (const r of biased) {
    const suggested = r.buoyFt && r.modelFt ? (r.scale * r.buoyFt) / r.modelFt : r.scale;
    console.log(`  ${r.id}: scale ${r.scale} → ~${suggested?.toFixed(2)} (${fmtPct(r.modelVsBuoyPct)} model bias)`);
  }
} else {
  console.log("\nNo spots exceeded 15% model-vs-buoy bias this run.");
}
