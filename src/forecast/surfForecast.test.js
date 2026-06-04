import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SPOT_CONFIGS } from "../data/spotConfigs.js";
import {
  adjustSurfPeriod,
  applyBuoyAnchorCorrection,
  applyWindChopFactor,
  blendWithBuoy,
  buoyToSwellComponent,
  computeHourlySurfForecast,
  computeSurfHeightForecast,
  faceHeightToDescriptor,
  getEffectiveSwellHsM,
  getFaceMultiplier,
  getSurfHeightScale,
  getSwellComponentsFromMarineHour,
  pickSwellPeriod,
  selectBestSwellComponent,
} from "./surfForecast.js";
import { getDirectionAttenuation } from "./swellDirection.js";

const oceanBeach = SPOT_CONFIGS.find(c => c.id === "ocean_beach_sf");

describe("pickSwellPeriod", () => {
  it("prefers peak period over mean", () => {
    assert.equal(pickSwellPeriod(14, 11), 11);
  });

  it("falls back to mean when peak is missing", () => {
    assert.equal(pickSwellPeriod(14, null), 14);
  });
});

describe("getSwellComponentsFromMarineHour", () => {
  it("includes primary and secondary swell trains", () => {
    const components = getSwellComponentsFromMarineHour({
      swellHeight: 0.6,
      swellPeriod: 14,
      swellPeakPeriod: 11,
      swellDir: 216,
      secondarySwellHeight: 0.3,
      secondarySwellPeriod: 16,
      secondarySwellPeakPeriod: 13,
      secondarySwellDir: 269,
    });
    assert.equal(components.length, 2);
    assert.equal(components[0].source, "primary");
    assert.equal(components[0].physicsPeriod, 14);
    assert.equal(components[0].displayPeriod, 11);
    assert.equal(components[1].source, "secondary");
    assert.equal(components[1].physicsPeriod, 16);
    assert.equal(components[1].displayPeriod, 13);
  });
});

describe("selectBestSwellComponent", () => {
  it("prefers directionally aligned swell for Ocean Beach", () => {
    const selected = selectBestSwellComponent(
      [
        { hsM: 0.6, physicsPeriod: 14, displayPeriod: 11, dir: 216, source: "primary" },
        { hsM: 0.3, physicsPeriod: 16, displayPeriod: 13, dir: 269, source: "secondary" },
        { hsM: 1.1, physicsPeriod: 17, displayPeriod: 17, dir: 306, source: "buoy" },
      ],
      oceanBeach
    );
    assert.equal(selected.source, "buoy");
    assert.equal(selected.dir, 306);
  });
});

describe("getEffectiveSwellHsM", () => {
  it("prefers swell_wave_height over wave_height", () => {
    assert.equal(getEffectiveSwellHsM({ swellHeight: 2, waveHeight: 3 }), 2);
  });

  it("falls back to wave_height when swell is zero", () => {
    assert.equal(getEffectiveSwellHsM({ swellHeight: 0, waveHeight: 1.5 }), 1.5);
  });
});

describe("getDirectionAttenuation", () => {
  it("returns 1 for optimal swell direction", () => {
    assert.equal(getDirectionAttenuation(300, oceanBeach), 1);
  });

  it("attenuates blocked swell directions", () => {
    assert.ok(getDirectionAttenuation(180, oceanBeach) < 0.5);
  });
});

describe("getFaceMultiplier", () => {
  it("increases with period for beach breaks", () => {
    const short = getFaceMultiplier(8, "beach");
    const long = getFaceMultiplier(16, "beach");
    assert.ok(long > short);
  });

  it("respects spot override", () => {
    assert.equal(getFaceMultiplier(12, "beach", 2.0), 2.0);
  });
});

describe("blendWithBuoy", () => {
  it("uses model only when buoy is stale", () => {
    const r = blendWithBuoy(2, { hsM: 3, ageMinutes: 200 });
    assert.equal(r.source, "model");
    assert.equal(r.hsM, 2);
  });

  it("blends when buoy is fresh", () => {
    const r = blendWithBuoy(2, { hsM: 3, swellHsM: 2.5, ageMinutes: 60 }, 1);
    assert.equal(r.source, "blend");
    assert.ok(r.hsM > 2 && r.hsM < 3);
  });
});

describe("getSurfHeightScale", () => {
  it("uses spot override when set", () => {
    assert.equal(getSurfHeightScale({ break_type: "beach", surf_height_scale: 0.48 }), 0.48);
  });

  it("falls back to break-type default", () => {
    assert.equal(getSurfHeightScale({ break_type: "reef_point" }), 0.62);
  });
});

describe("computeSurfHeightForecast", () => {
  it("produces face height larger than raw Hs for typical swell", () => {
    const r = computeSurfHeightForecast({
      marineHour: {
        swellHeight: 2,
        swellPeriod: 12,
        swellDir: 300,
        waveHeight: 2.2,
      },
      spotConfig: oceanBeach,
    });
    assert.ok(r.rawSurfHeightFt > r.swellHsFt * 0.9);
    assert.ok(r.surfHeightFt < r.rawSurfHeightFt);
    assert.equal(r.surfHeightScale, 0.48);
    assert.equal(r.source, "model");
    assert.ok(r.descriptor.length > 0);
  });

  it("uses mean period for face height when peak is shorter", () => {
    const withPeak = computeSurfHeightForecast({
      marineHour: {
        swellHeight: 2,
        swellPeriod: 14,
        swellPeakPeriod: 11,
        swellDir: 300,
      },
      spotConfig: oceanBeach,
    });
    const meanOnly = computeSurfHeightForecast({
      marineHour: { swellHeight: 2, swellPeriod: 14, swellDir: 300 },
      spotConfig: oceanBeach,
    });
    assert.equal(withPeak.surfHeightFt, meanOnly.surfHeightFt);
    assert.ok(withPeak.swellPeriod < meanOnly.swellPeriod);
  });

  it("uses buoy NW swell instead of blocked primary for Ocean Beach", () => {
    const r = computeSurfHeightForecast({
      marineHour: {
        swellHeight: 0.62,
        swellPeriod: 14,
        swellDir: 216,
        secondarySwellHeight: 0.3,
        secondarySwellPeriod: 16,
        secondarySwellDir: 269,
      },
      spotConfig: oceanBeach,
      buoyObservation: {
        hsM: 1.5,
        swellHsM: 1.1,
        periodS: 17,
        directionDeg: 306,
        ageMinutes: 30,
      },
    });
    assert.ok(r.surfHeightFt >= 2);
    assert.ok(r.surfHeightFt <= 4.5);
    assert.equal(r.swellSource, "buoy");
    assert.ok(r.swellPeriod >= 11 && r.swellPeriod <= 13);
    assert.ok(r.physicsPeriod >= 16);
    assert.ok(r.directionFactor >= 0.85);
  });

  it("uses buoy blend when provided", () => {
    const modelOnly = computeSurfHeightForecast({
      marineHour: { swellHeight: 2, swellPeriod: 12, swellDir: 300 },
      spotConfig: oceanBeach,
    });
    const blended = computeSurfHeightForecast({
      marineHour: { swellHeight: 2, swellPeriod: 12, swellDir: 300 },
      spotConfig: oceanBeach,
      buoyObservation: { hsM: 3, swellHsM: 2.8, periodS: 13, directionDeg: 300, ageMinutes: 30 },
    });
    assert.ok(["blend", "buoy"].includes(blended.source));
    assert.ok(blended.surfHeightFt !== modelOnly.surfHeightFt || blended.swellHsFt !== modelOnly.swellHsFt);
  });

  it("reusing the same buoy on every hour flattens a time series", () => {
    const buoy = { hsM: 1.5, swellHsM: 1.1, periodS: 17, directionDeg: 306, ageMinutes: 30 };
    const blockedModelHours = [
      { swellHeight: 0.4, swellPeriod: 10, swellDir: 180 },
      { swellHeight: 0.5, swellPeriod: 11, swellDir: 200 },
      { swellHeight: 0.6, swellPeriod: 12, swellDir: 210 },
    ];
    const withBuoy = blockedModelHours.map(marineHour =>
      computeSurfHeightForecast({ marineHour, spotConfig: oceanBeach, buoyObservation: buoy }).surfHeightFt
    );
    assert.equal(new Set(withBuoy).size, 1);
  });

  it("model-only hourly forecasts vary with changing marine input", () => {
    const varyingModelHours = [
      { swellHeight: 0.8, swellPeriod: 12, swellDir: 300 },
      { swellHeight: 1.5, swellPeriod: 14, swellDir: 310 },
      { swellHeight: 2.2, swellPeriod: 16, swellDir: 305 },
    ];
    const modelOnly = varyingModelHours.map(marineHour =>
      computeSurfHeightForecast({ marineHour, spotConfig: oceanBeach, buoyObservation: null }).surfHeightFt
    );
    assert.ok(new Set(modelOnly).size > 1);
  });
});

describe("adjustSurfPeriod", () => {
  it("damps offshore buoy period for beach breaks", () => {
    const display = adjustSurfPeriod(17, oceanBeach, "buoy");
    assert.ok(display >= 11 && display <= 13);
  });

  it("applies lighter damping for model peak period", () => {
    const display = adjustSurfPeriod(12, oceanBeach, "model");
    assert.equal(display, 11);
  });
});

describe("buoyToSwellComponent", () => {
  it("prefers swell height over total wave height", () => {
    const c = buoyToSwellComponent({ hsM: 1.5, swellHsM: 1.1, periodS: 16, directionDeg: 300, ageMinutes: 10 });
    assert.equal(c.hsM, 1.1);
  });
});

describe("faceHeightToDescriptor", () => {
  it("maps common ranges", () => {
    assert.equal(faceHeightToDescriptor(0.5), "ankle-shin");
    assert.equal(faceHeightToDescriptor(3.5), "chest-shoulder");
    assert.equal(faceHeightToDescriptor(5.5), "1 ft overhead");
  });
});

describe("applyBuoyAnchorCorrection", () => {
  it("matches anchor at hi when ratio is within clamp and decays by hi+12", () => {
    const anchorFt = 3;
    const modelAtAnchor = 2;
    const atHi = applyBuoyAnchorCorrection({
      modelSurfHeightFt: 2,
      hourIndex: 6,
      anchorIndex: 6,
      anchorSurfHeightFt: anchorFt,
      modelSurfHeightAtAnchor: modelAtAnchor,
    });
    assert.equal(atHi, anchorFt);

    const plus3 = applyBuoyAnchorCorrection({
      modelSurfHeightFt: 3,
      hourIndex: 9,
      anchorIndex: 6,
      anchorSurfHeightFt: anchorFt,
      modelSurfHeightAtAnchor: modelAtAnchor,
    });
    assert.ok(plus3 >= 3);
    assert.notEqual(plus3, 3);

    const plus6 = applyBuoyAnchorCorrection({
      modelSurfHeightFt: 3,
      hourIndex: 12,
      anchorIndex: 6,
      anchorSurfHeightFt: anchorFt,
      modelSurfHeightAtAnchor: modelAtAnchor,
    });
    assert.equal(plus6, 3);

    const plus12 = applyBuoyAnchorCorrection({
      modelSurfHeightFt: 3,
      hourIndex: 18,
      anchorIndex: 6,
      anchorSurfHeightFt: anchorFt,
      modelSurfHeightAtAnchor: modelAtAnchor,
    });
    assert.equal(plus12, 3);
  });

  it("does not correct past hours", () => {
    const corrected = applyBuoyAnchorCorrection({
      modelSurfHeightFt: 3,
      hourIndex: 2,
      anchorIndex: 6,
      anchorSurfHeightFt: 5,
      modelSurfHeightAtAnchor: 2,
    });
    assert.equal(corrected, 3);
  });
});

describe("applyWindChopFactor", () => {
  it("reduces height more for onshore than offshore", () => {
    const facing = oceanBeach.break_facing_direction;
    const offshore = applyWindChopFactor(4, 18, facing + 180, oceanBeach);
    const onshore = applyWindChopFactor(4, 18, facing, oceanBeach);
    assert.equal(offshore, 4);
    assert.ok(onshore < offshore);
  });
});

describe("computeHourlySurfForecast pipeline", () => {
  it("keeps varying heights after anchor on a ramping marine series", () => {
    const marineHours = [
      { swellHeight: 0.8, swellPeriod: 12, swellDir: 300 },
      { swellHeight: 1.2, swellPeriod: 13, swellDir: 305 },
      { swellHeight: 1.6, swellPeriod: 14, swellDir: 310 },
      { swellHeight: 2.0, swellPeriod: 15, swellDir: 315 },
    ];
    const buoy = { hsM: 1.5, swellHsM: 1.2, periodS: 14, directionDeg: 300, ageMinutes: 30 };
    const hi = 1;
    const modelAtHi = computeHourlySurfForecast({
      marineHour: marineHours[hi],
      spotConfig: oceanBeach,
      hourIndex: hi,
      windHour: { speedMph: 8, directionDeg: oceanBeach.break_facing_direction + 180 },
    });
    const anchorAtHi = computeHourlySurfForecast({
      marineHour: marineHours[hi],
      spotConfig: oceanBeach,
      buoyObservation: buoy,
      hourIndex: hi,
      useBuoyForBase: true,
      windHour: { speedMph: 8, directionDeg: oceanBeach.break_facing_direction + 180 },
    });
    const anchor = {
      index: hi,
      surfHeightFt: anchorAtHi.surfHeightFt,
      modelSurfHeightFt: modelAtHi.surfHeightFt,
    };
    const series = marineHours.map((marineHour, i) =>
      computeHourlySurfForecast({
        marineHour,
        spotConfig: oceanBeach,
        hourIndex: i,
        anchor,
        windHour: { speedMph: 8, directionDeg: oceanBeach.break_facing_direction + 180 },
      }).surfHeightFt
    );
    assert.ok(new Set(series).size > 1);
    assert.equal(series[hi], anchor.surfHeightFt);
  });
});

describe("calibrateSpotConfigFromMarine", () => {
  it("updates misaligned swell directions using local marine forecast", async () => {
    const { calibrateSpotConfigFromMarine, computeSurfHeightForecast, marineHourFromArrays } = await import("./surfForecast.js");

    const hourly = {
      time: ["2026-06-03T10:00", "2026-06-03T11:00", "2026-06-03T12:00"],
      wave_height: [1.4, 1.4, 1.4],
      wave_period: [8, 8, 8],
      wave_peak_period: [9, 9, 9],
      wave_direction: [320, 320, 320],
      swell_wave_height: [1.2, 1.2, 1.2],
      swell_wave_period: [12, 12, 12],
      swell_wave_peak_period: [13, 13, 13],
      swell_wave_direction: [320, 320, 320],
      secondary_swell_wave_height: [0, 0, 0],
      secondary_swell_wave_period: [0, 0, 0],
      secondary_swell_wave_peak_period: [0, 0, 0],
      secondary_swell_wave_direction: [0, 0, 0],
      wind_wave_height: [0.2, 0.2, 0.2],
      wind_wave_period: [4, 4, 4],
      wind_wave_peak_period: [4, 4, 4],
      wind_wave_direction: [90, 90, 90],
    };

    const wrongConfig = {
      break_type: "reef",
      break_facing_direction: 90,
      optimal_swell_directions: [90],
      swell_direction_tolerance: 15,
      surf_height_scale: 0.62,
    };
    const calibrated = calibrateSpotConfigFromMarine(wrongConfig, hourly);
    const mh = marineHourFromArrays(hourly, 2);
    const before = computeSurfHeightForecast({ marineHour: mh, spotConfig: wrongConfig }).surfHeightFt;
    const after = computeSurfHeightForecast({ marineHour: mh, spotConfig: calibrated }).surfHeightFt;

    assert.ok(before < 1);
    assert.ok(after >= 2);
  });
});

describe("computeSurfHeightForecast fallback", () => {
  it("uses total wave height when directional filtering would round to zero", () => {
    const marineHour = {
      waveHeight: 1.4,
      wavePeriod: 8,
      swellHeight: 1.2,
      swellPeriod: 12,
      swellPeakPeriod: 13,
      swellDir: 320,
    };
    const wrongConfig = {
      break_type: "reef",
      break_facing_direction: 90,
      optimal_swell_directions: [90],
      swell_direction_tolerance: 15,
      surf_height_scale: 0.48,
    };
    const result = computeSurfHeightForecast({ marineHour, spotConfig: wrongConfig });
    assert.ok(result.surfHeightFt > 0);
  });
});
