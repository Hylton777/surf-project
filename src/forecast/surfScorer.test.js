import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SPOT_CONFIGS } from "../data/spotConfigs.js";
import { classifyWind, computeSurfScore, getDisplayRating } from "./surfScorer.js";

const oceanBeach = SPOT_CONFIGS.find(c => c.id === "ocean_beach_sf");

describe("classifyWind", () => {
  it("classifies offshore when wind opposes break facing", () => {
    assert.equal(classifyWind(90, 270), "offshore");
  });

  it("classifies onshore when wind aligns with break facing", () => {
    assert.equal(classifyWind(270, 270), "onshore");
  });

  it("returns cross-shore for oblique angles", () => {
    assert.equal(classifyWind(0, 270), "cross-shore");
  });
});

describe("getDisplayRating", () => {
  it("keeps Decent and Poor unchanged at any height", () => {
    assert.equal(getDisplayRating("Decent", 2), "Decent");
    assert.equal(getDisplayRating("Poor", 10), "Poor");
    assert.equal(getDisplayRating("Dormant", 20), "Dormant");
  });

  it("maps Pumping tier by face height", () => {
    assert.equal(getDisplayRating("Pumping", 7), "Pumping");
    assert.equal(getDisplayRating("Pumping", 5), "Good");
    assert.equal(getDisplayRating("Pumping", 2), "Smooth");
  });

  it("maps Good tier by face height", () => {
    assert.equal(getDisplayRating("Good", 5), "Good");
    assert.equal(getDisplayRating("Good", 2), "Smooth");
  });

  it("keeps score label when height is unknown", () => {
    assert.equal(getDisplayRating("Pumping", null), "Pumping");
    assert.equal(getDisplayRating("Good", NaN), "Good");
  });
});

describe("computeSurfScore display labels", () => {
  it("returns Smooth for high score with small face height", () => {
    const result = computeSurfScore(
      {
        swellHeight: 3.5,
        swellPeriod: 14,
        swellDirection: 300,
        windSpeed: 5,
        windDirection: oceanBeach.break_facing_direction + 180,
        tide: 2.5,
      },
      oceanBeach
    );
    assert.ok(result.score >= 65, `expected score >= 65, got ${result.score}`);
    assert.equal(result.rating, "Smooth");
  });
});
