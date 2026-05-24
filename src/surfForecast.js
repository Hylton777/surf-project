import { getDirectionAttenuation, getDirectionScore } from "./swellDirection.js";
import { getDefaultSurfHeightScale, getDefaultSurfPeriodScale } from "../surfSpotConfigs.js";

export const M_TO_FT = 3.28084;
export const BUOY_BLEND_WEIGHT = 0.35;
export const BUOY_MAX_AGE_MINUTES = 180;
/** Extra damping when period comes from offshore buoy SwP (vs model peak at grid). */
export const OFFSHORE_BUOY_PERIOD_FACTOR = 0.74;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const roundHalfFt = ft => Math.round(ft * 2) / 2;

export const mToFt = m => m * M_TO_FT;

/** @param {number} ft */
export const faceHeightToDescriptor = ft => {
  if (!Number.isFinite(ft) || ft <= 0) return "flat";
  if (ft < 1) return "ankle-shin";
  if (ft < 2) return "knee-thigh";
  if (ft < 3) return "waist-belly";
  if (ft < 4) return "chest-shoulder";
  if (ft < 5) return "head high";
  if (ft < 6) return "1 ft overhead";
  if (ft < 8) return "2-3 ft overhead";
  if (ft < 10) return "double overhead";
  if (ft < 12) return "double overhead+";
  if (ft < 15) return "triple overhead";
  return "really big";
};

const BREAK_MULTIPLIER_RANGES = {
  beach: { min: 1.55, max: 1.75 },
  point: { min: 1.35, max: 1.55 },
  reef_point: { min: 1.35, max: 1.55 },
  reef: { min: 1.25, max: 1.45 },
};

const getBreakMultiplierRange = breakType => {
  const key = String(breakType || "beach").toLowerCase();
  return BREAK_MULTIPLIER_RANGES[key] || BREAK_MULTIPLIER_RANGES.beach;
};

/** Period boost: longer swell → higher end of break-type multiplier range. */
export const getFaceMultiplier = (swellPeriod, breakType, spotOverride) => {
  if (Number.isFinite(spotOverride) && spotOverride > 0) return spotOverride;
  const { min, max } = getBreakMultiplierRange(breakType);
  const period = Number.isFinite(swellPeriod) ? swellPeriod : 8;
  const t = clamp((period - 6) / 12, 0, 1);
  return min + t * (max - min);
};

/** Spot-specific calibration applied after face-height conversion. */
export const getSurfHeightScale = spotConfig => {
  const custom = Number(spotConfig?.surf_height_scale);
  if (Number.isFinite(custom) && custom > 0) return custom;
  return getDefaultSurfHeightScale(spotConfig?.break_type);
};

/** Spot-specific nearshore period calibration for display (physics uses raw period). */
export const getSurfPeriodScale = spotConfig => {
  const custom = Number(spotConfig?.surf_period_scale);
  if (Number.isFinite(custom) && custom > 0) return custom;
  return getDefaultSurfPeriodScale(spotConfig?.break_type);
};

/** Prefer peak period (Surfline-style) over spectral mean when both exist. */
export const pickSwellPeriod = (meanPeriod, peakPeriod) => {
  const peak = Number(peakPeriod);
  const mean = Number(meanPeriod);
  if (Number.isFinite(peak) && peak > 0) return peak;
  if (Number.isFinite(mean) && mean > 0) return mean;
  return 0;
};

/** Mean period drives face-height energy; peak period is for display only. */
export const parseSwellPeriods = (meanPeriod, peakPeriod) => {
  const mean = Number(meanPeriod);
  const displayPeriod = pickSwellPeriod(meanPeriod, peakPeriod);
  const physicsPeriod =
    Number.isFinite(mean) && mean > 0 ? mean : displayPeriod;
  return { physicsPeriod, displayPeriod };
};

export const roundDisplayPeriodS = period => {
  const n = Number(period);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(1, Math.round(n));
};

/**
 * Convert offshore/model period to spot display period (Surfline-like).
 * Face-height physics still uses the unadjusted period.
 */
export const adjustSurfPeriod = (offshorePeriod, spotConfig, swellSource = "model") => {
  const period = Number(offshorePeriod);
  if (!Number.isFinite(period) || period <= 0) return 0;
  let scaled = period * getSurfPeriodScale(spotConfig);
  if (swellSource === "buoy" || swellSource === "blend") {
    scaled *= OFFSHORE_BUOY_PERIOD_FACTOR;
  }
  return roundDisplayPeriodS(scaled);
};

const isBuoyFresh = buoyObservation => {
  const ageMinutes = Number(buoyObservation?.ageMinutes);
  return Number.isFinite(ageMinutes) && ageMinutes >= 0 && ageMinutes <= BUOY_MAX_AGE_MINUTES;
};

/**
 * @param {object} marineHour
 * @returns {{ hsM: number, physicsPeriod: number, displayPeriod: number, dir: number | null, source: string }[]}
 */
export const getSwellComponentsFromMarineHour = marineHour => {
  const components = [];
  const add = (height, meanPeriod, peakPeriod, dir, source) => {
    const hsM = Number(height);
    if (!Number.isFinite(hsM) || hsM <= 0) return;
    const { physicsPeriod, displayPeriod } = parseSwellPeriods(meanPeriod, peakPeriod);
    const dirN = Number(dir);
    components.push({
      hsM,
      physicsPeriod,
      displayPeriod,
      dir: Number.isFinite(dirN) ? dirN : null,
      source,
    });
  };

  add(
    marineHour?.swellHeight,
    marineHour?.swellPeriod,
    marineHour?.swellPeakPeriod,
    marineHour?.swellDir,
    "primary"
  );
  add(
    marineHour?.secondarySwellHeight,
    marineHour?.secondarySwellPeriod,
    marineHour?.secondarySwellPeakPeriod,
    marineHour?.secondarySwellDir,
    "secondary"
  );

  const windWaveHs = Number(marineHour?.windWaveHeight);
  const swellHs = Number(marineHour?.swellHeight);
  if (
    Number.isFinite(windWaveHs) &&
    windWaveHs > 0 &&
    (!Number.isFinite(swellHs) || swellHs <= 0)
  ) {
    add(
      windWaveHs,
      marineHour?.windWavePeriod,
      marineHour?.windWavePeakPeriod,
      marineHour?.windWaveDir,
      "wind_wave"
    );
  }

  return components;
};

export const buoyToSwellComponent = buoyObservation => {
  if (!isBuoyFresh(buoyObservation)) return null;
  const hsM = Number.isFinite(Number(buoyObservation?.swellHsM)) && buoyObservation.swellHsM > 0
    ? Number(buoyObservation.swellHsM)
    : Number(buoyObservation?.hsM);
  if (!Number.isFinite(hsM) || hsM <= 0) return null;
  const period = Number(buoyObservation?.periodS);
  const dir = Number(buoyObservation?.directionDeg);
  return {
    hsM,
    physicsPeriod: Number.isFinite(period) && period > 0 ? period : 0,
    displayPeriod: Number.isFinite(period) && period > 0 ? period : 0,
    dir: Number.isFinite(dir) ? dir : null,
    source: "buoy",
  };
};

/**
 * Pick the swell train that best matches the spot (direction-weighted energy).
 * @param {{ hsM: number, period: number, dir: number | null, source: string }[]} components
 */
export const selectBestSwellComponent = (components, spotConfig) => {
  if (!components?.length) return null;

  let best = null;
  let bestScore = -1;

  for (const component of components) {
    const dirFactor = component.dir != null
      ? getDirectionAttenuation(component.dir, spotConfig)
      : 0.5;
    const buoyBoost = component.source === "buoy" && dirFactor >= 0.85 ? 1.15 : 1;
    const score = component.hsM * dirFactor * buoyBoost;

    if (score > bestScore) {
      bestScore = score;
      best = { ...component, directionFactor: dirFactor, selectionScore: score };
    }
  }

  return best;
};

/**
 * Pick effective offshore swell Hs (m) from marine hourly fields (legacy helper).
 * @param {object} marineHour
 */
export const getEffectiveSwellHsM = marineHour => {
  const selected = selectBestSwellComponent(
    getSwellComponentsFromMarineHour(marineHour),
    {}
  );
  if (selected) return selected.hsM;

  const waveHs = Number(marineHour?.waveHeight);
  return Number.isFinite(waveHs) && waveHs > 0 ? waveHs : 0;
};

export const getEffectiveSwellPeriod = marineHour => {
  const selected = selectBestSwellComponent(
    getSwellComponentsFromMarineHour(marineHour),
    {}
  );
  if (selected?.physicsPeriod > 0) return selected.physicsPeriod;

  const swellPeriod = Number(marineHour?.swellPeriod);
  const wavePeriod = Number(marineHour?.wavePeriod);
  if (Number.isFinite(swellPeriod) && swellPeriod > 0) return swellPeriod;
  if (Number.isFinite(wavePeriod) && wavePeriod > 0) return wavePeriod;
  return 0;
};

export const getEffectiveSwellDirection = marineHour => {
  const selected = selectBestSwellComponent(
    getSwellComponentsFromMarineHour(marineHour),
    {}
  );
  if (selected?.dir != null) return selected.dir;

  const swellDir = Number(marineHour?.swellDir);
  const waveDir = Number(marineHour?.waveDir);
  if (Number.isFinite(swellDir)) return swellDir;
  if (Number.isFinite(waveDir)) return waveDir;
  return 0;
};

/**
 * Blend model Hs with buoy observation when fresh and directionally useful.
 */
export const blendWithBuoy = (modelHsM, buoyObservation, buoyDirFactor = 0) => {
  const buoyHsM = Number.isFinite(Number(buoyObservation?.swellHsM)) && buoyObservation.swellHsM > 0
    ? Number(buoyObservation.swellHsM)
    : Number(buoyObservation?.hsM);
  const ageMinutes = Number(buoyObservation?.ageMinutes);

  if (
    !isBuoyFresh(buoyObservation) ||
    !Number.isFinite(buoyHsM) ||
    buoyHsM <= 0
  ) {
    return { hsM: modelHsM, source: "model" };
  }

  const weight = buoyDirFactor >= 0.85 ? BUOY_BLEND_WEIGHT : BUOY_BLEND_WEIGHT * 0.5;
  const blended = (1 - weight) * modelHsM + weight * buoyHsM;
  return { hsM: blended, source: "blend", buoyHsM, buoyAgeMinutes: ageMinutes, blendWeight: weight };
};

/**
 * @param {{ marineHour: object, spotConfig: object, buoyObservation?: object | null }} args
 */
export function computeSurfHeightForecast({ marineHour, spotConfig, buoyObservation = null }) {
  const modelComponents = getSwellComponentsFromMarineHour(marineHour);
  const buoyComponent = buoyToSwellComponent(buoyObservation);
  const allComponents = buoyComponent
    ? [...modelComponents, buoyComponent]
    : modelComponents;

  let selected = selectBestSwellComponent(allComponents, spotConfig);

  if (!selected) {
    const waveHs = Number(marineHour?.waveHeight);
    const { physicsPeriod, displayPeriod } = parseSwellPeriods(
      marineHour?.swellPeriod,
      marineHour?.swellPeakPeriod
    );
    selected = {
      hsM: Number.isFinite(waveHs) && waveHs > 0 ? waveHs : 0,
      physicsPeriod: physicsPeriod || getEffectiveSwellPeriod(marineHour),
      displayPeriod: displayPeriod || physicsPeriod || getEffectiveSwellPeriod(marineHour),
      dir: getEffectiveSwellDirection(marineHour),
      source: "total_wave",
      directionFactor: 0.5,
    };
  }

  const buoyDirFactor = buoyComponent?.dir != null
    ? getDirectionAttenuation(buoyComponent.dir, spotConfig)
    : 0;

  let hsM = selected.hsM;
  let physicsPeriod = selected.physicsPeriod;
  let displayPeriod = selected.displayPeriod || selected.physicsPeriod;
  let swellDir = selected.dir;
  let directionFactor = selected.directionFactor ?? getDirectionAttenuation(swellDir, spotConfig);
  let source = selected.source === "buoy" ? "buoy" : "model";
  let periodSource = selected.source === "buoy" ? "buoy" : "model";

  if (selected.source !== "buoy" && buoyComponent && buoyDirFactor >= 0.55) {
    const blended = blendWithBuoy(selected.hsM, buoyObservation, buoyDirFactor);
    hsM = blended.hsM;
    source = blended.source;
    if (buoyDirFactor >= directionFactor) {
      const buoyPhysics = buoyComponent.physicsPeriod || physicsPeriod;
      const buoyDisplay = buoyComponent.displayPeriod || buoyPhysics;
      if (source === "blend" && physicsPeriod > 0 && buoyPhysics > 0) {
        physicsPeriod =
          (1 - blended.blendWeight) * physicsPeriod + blended.blendWeight * buoyPhysics;
        displayPeriod =
          (1 - blended.blendWeight) * displayPeriod + blended.blendWeight * buoyDisplay;
      } else {
        physicsPeriod = buoyPhysics;
        displayPeriod = buoyDisplay;
      }
      swellDir = buoyComponent.dir ?? swellDir;
      directionFactor = buoyDirFactor;
      periodSource = source === "blend" ? "blend" : "buoy";
    }
  }

  const attenuatedHsM = hsM * directionFactor;
  const swellHsFt = roundHalfFt(mToFt(attenuatedHsM));

  const faceMultiplier = getFaceMultiplier(
    physicsPeriod,
    spotConfig?.break_type,
    spotConfig?.face_multiplier
  );
  const rawSurfHeightFt = roundHalfFt(swellHsFt * faceMultiplier);
  const surfHeightScale = getSurfHeightScale(spotConfig);
  const surfHeightFt = roundHalfFt(rawSurfHeightFt * surfHeightScale);
  const descriptor = faceHeightToDescriptor(surfHeightFt);

  const buoyHsM = Number.isFinite(Number(buoyObservation?.swellHsM)) && buoyObservation.swellHsM > 0
    ? Number(buoyObservation.swellHsM)
    : Number(buoyObservation?.hsM);

  return {
    surfHeightFt,
    rawSurfHeightFt,
    surfHeightScale,
    swellHsFt,
    directionFactor,
    faceMultiplier,
    descriptor,
    source,
    swellSource: selected.source,
    buoyHsFt: Number.isFinite(buoyHsM) ? roundHalfFt(mToFt(buoyHsM)) : null,
    buoyAgeMinutes: buoyObservation?.ageMinutes ?? null,
    swellPeriod: adjustSurfPeriod(displayPeriod, spotConfig, periodSource),
    physicsPeriod,
    displayPeriod,
    swellDir,
    directionScore: swellDir != null ? getDirectionScore(swellDir, spotConfig) : 0,
  };
}

/** Build marineHour-shaped object from raw Open-Meteo hourly arrays at index i. */
export const marineHourFromArrays = (hourly, i) => ({
  waveHeight: hourly.wave_height?.[i],
  wavePeriod: hourly.wave_period?.[i],
  wavePeakPeriod: hourly.wave_peak_period?.[i],
  waveDir: hourly.wave_direction?.[i],
  swellHeight: hourly.swell_wave_height?.[i],
  swellPeriod: hourly.swell_wave_period?.[i],
  swellPeakPeriod: hourly.swell_wave_peak_period?.[i],
  swellDir: hourly.swell_wave_direction?.[i],
  secondarySwellHeight: hourly.secondary_swell_wave_height?.[i],
  secondarySwellPeriod: hourly.secondary_swell_wave_period?.[i],
  secondarySwellPeakPeriod: hourly.secondary_swell_wave_peak_period?.[i],
  secondarySwellDir: hourly.secondary_swell_wave_direction?.[i],
  windWaveHeight: hourly.wind_wave_height?.[i],
  windWavePeriod: hourly.wind_wave_period?.[i],
  windWavePeakPeriod: hourly.wind_wave_peak_period?.[i],
  windWaveDir: hourly.wind_wave_direction?.[i],
});
