import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SPOT_CONFIGS } from "../surfSpotConfigs.js";
import {
  adjustSurfPeriod,
  blendWithBuoy,
  buoyToSwellComponent,
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
