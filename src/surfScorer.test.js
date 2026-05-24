import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SPOT_CONFIGS } from "../surfSpotConfigs.js";
import {
  computeSurfScore,
  getPeriodDeficitMultiplier,
  getPeriodScore,
  getRatingFromScore,
  getWeights,
  reduceHeightWeight,
} from "./surfScorer.js";

const oceanBeach = SPOT_CONFIGS.find(c => c.id === "ocean_beach_sf");
const lindaMar = SPOT_CONFIGS.find(c => c.id === "linda_mar");

const goodObConditions = {
  swellHeight: 6,
  swellPeriod: 12,
  swellDirection: 300,
  windSpeed: 5,
  windDirection: 90,
  tide: 2.5,
};

describe("reduceHeightWeight", () => {
  it("reduces height by 0.05 and redistributes proportionally", () => {
    const input = { height: 0.25, period: 0.20, direction: 0.20, wind: 0.25, tide: 0.10 };
    const result = reduceHeightWeight(input);
    assert.equal(result.height, 0.20);
    assert.ok(Math.abs(result.period - 0.213) < 0.001);
    assert.ok(Math.abs(result.direction - 0.213) < 0.001);
    assert.ok(Math.abs(result.wind - 0.267) < 0.001);
    assert.ok(Math.abs(result.tide - 0.107) < 0.001);
    const sum = result.height + result.period + result.direction + result.wind + result.tide;
    assert.ok(Math.abs(sum - 1) < 0.001);
  });
});

describe("getWeights", () => {
  it("uses config weights as-is for built-in spots", () => {
    const weights = getWeights(oceanBeach);
    assert.equal(weights.height, 0.20);
    assert.ok(Math.abs(weights.period - 0.267) < 0.001);
  });

  it("applies height reduction for user-added spots", () => {
    const weights = getWeights({
      ...oceanBeach,
      isUserAdded: true,
      weights: { height: 0.25, period: 0.20, direction: 0.20, wind: 0.25, tide: 0.10 },
    });
    assert.equal(weights.height, 0.20);
    const sum = weights.height + weights.period + weights.direction + weights.wind + weights.tide;
    assert.ok(Math.abs(sum - 1) < 0.001);
  });
});

describe("getPeriodScore", () => {
  it("anchors tiers to each spot min_period_s", () => {
    assert.equal(getPeriodScore(8, 8), 70);
    assert.equal(getPeriodScore(10, 8), 85);
    assert.equal(getPeriodScore(10, 10), 70);
    assert.equal(getPeriodScore(9, 10), 55);
    assert.equal(getPeriodScore(8, 10), 35);
    assert.equal(getPeriodScore(6, 10), 15);
  });
});

describe("getPeriodDeficitMultiplier", () => {
  it("returns 1 at or above minimum period", () => {
    assert.equal(getPeriodDeficitMultiplier(10, 10), 1);
    assert.equal(getPeriodDeficitMultiplier(11, 10), 1);
  });

  it("applies graduated penalties below minimum period", () => {
    assert.equal(getPeriodDeficitMultiplier(9, 10), 0.85);
    assert.equal(getPeriodDeficitMultiplier(8, 10), 0.7);
    assert.equal(getPeriodDeficitMultiplier(7, 10), 0.5);
    assert.equal(getPeriodDeficitMultiplier(5, 10), 0.3);
  });
});

describe("computeSurfScore", () => {
  it("scores good all-around conditions in the Good range", () => {
    const result = computeSurfScore(goodObConditions, oceanBeach);
    assert.ok(result.score >= 65, `expected >= 65, got ${result.score}`);
    assert.ok(["Good", "Pumping"].includes(result.rating));
  });

  it("does not lock marginally short period at 30 when other factors are good", () => {
    const result = computeSurfScore({ ...goodObConditions, swellPeriod: 9 }, oceanBeach);
    assert.ok(result.score >= 50, `expected >= 50, got ${result.score}`);
    assert.notEqual(result.score, 30);
    assert.ok(["Decent", "Good", "Pumping"].includes(result.rating));
  });

  it("heavily penalizes period well below minimum", () => {
    const result = computeSurfScore({ ...goodObConditions, swellPeriod: 6 }, oceanBeach);
    assert.ok(result.score >= 20 && result.score <= 40, `expected 20–40, got ${result.score}`);
  });

  it("allows full scoring when period meets spot minimum", () => {
    const result = computeSurfScore(
      {
        swellHeight: 3,
        swellPeriod: 8,
        swellDirection: 290,
        windSpeed: 5,
        windDirection: 70,
        tide: 2,
      },
      lindaMar
    );
    assert.ok(result.score >= 65, `expected >= 65, got ${result.score}`);
  });

  it("caps wrong swell direction at 25 or below", () => {
    const result = computeSurfScore({ ...goodObConditions, swellDirection: 180 }, oceanBeach);
    assert.ok(result.score <= 25, `expected <= 25, got ${result.score}`);
    assert.equal(result.breakdown.directionScore, 0);
  });

  it("returns near-zero for swell below min rideable height", () => {
    const result = computeSurfScore({ ...goodObConditions, swellHeight: 1 }, oceanBeach);
    assert.equal(result.score, 5);
    assert.equal(result.rating, "Poor");
  });

  it("smooths direction scores between bucket thresholds", () => {
    const tight = { optimal_swell_directions: [300], swell_direction_tolerance: 30 };
    const atT2 = computeSurfScore(
      { ...goodObConditions, swellDirection: 330 },
      { ...oceanBeach, ...tight }
    );
    const betweenT2T3 = computeSurfScore(
      { ...goodObConditions, swellDirection: 337 },
      { ...oceanBeach, ...tight }
    );
    assert.equal(atT2.breakdown.directionScore, 80);
    assert.ok(
      betweenT2T3.breakdown.directionScore > 55 && betweenT2T3.breakdown.directionScore < 80,
      `expected between 55 and 80, got ${betweenT2T3.breakdown.directionScore}`
    );
  });
});

describe("getRatingFromScore", () => {
  it("maps score bands to rating labels", () => {
    assert.equal(getRatingFromScore(90), "Pumping");
    assert.equal(getRatingFromScore(70), "Good");
    assert.equal(getRatingFromScore(50), "Decent");
    assert.equal(getRatingFromScore(30), "Bad");
    assert.equal(getRatingFromScore(10), "Poor");
  });
});
