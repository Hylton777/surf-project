import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  conditionSimilarity,
  computeSpotPreferenceBoost,
  summarizeSessionHistoryForAi,
  PREFERENCE_BOOST_MAX,
} from "./sessionSimilarity.js";

describe("conditionSimilarity", () => {
  it("returns ~1 for identical conditions", () => {
    const v = { surfHeightFt: 4, swellPeriod: 12, swellDir: 280, windSpeedMph: 8, score: 75 };
    assert.ok(conditionSimilarity(v, v) > 0.95);
  });

  it("returns lower score for very different height", () => {
    const a = { surfHeightFt: 3, swellPeriod: 12, swellDir: 280, windSpeedMph: 8, score: 70 };
    const b = { surfHeightFt: 8, swellPeriod: 12, swellDir: 280, windSpeedMph: 8, score: 70 };
    assert.ok(conditionSimilarity(a, b) < conditionSimilarity(a, a));
  });
});

describe("computeSpotPreferenceBoost", () => {
  it("returns 0 with no sessions", () => {
    assert.equal(computeSpotPreferenceBoost("ob", { surfHeightFt: 4, score: 70 }, []), 0);
  });

  it("boosts when today resembles a 5-star session", () => {
    const sessions = [{
      spotId: "ob",
      stars: 5,
      forecastSnapshot: {
        avg: { surfHeightFt: 4, swellPeriod: 12, swellDir: 280, windSpeedMph: 6, score: 80 },
      },
    }];
    const boost = computeSpotPreferenceBoost(
      "ob",
      { surfHeightFt: 4.2, swellPeriod: 11, swellDir: 285, windSpeedMph: 7, score: 78 },
      sessions
    );
    assert.ok(boost > 2);
    assert.ok(boost <= PREFERENCE_BOOST_MAX);
  });

  it("ignores low-star sessions", () => {
    const sessions = [{
      spotId: "ob",
      stars: 2,
      forecastSnapshot: {
        avg: { surfHeightFt: 4, swellPeriod: 12, swellDir: 280, windSpeedMph: 6, score: 80 },
      },
    }];
    assert.equal(
      computeSpotPreferenceBoost("ob", { surfHeightFt: 4, score: 70 }, sessions),
      0
    );
  });
});

describe("summarizeSessionHistoryForAi", () => {
  it("returns null for empty history", () => {
    assert.equal(summarizeSessionHistoryForAi([]), null);
  });

  it("uses light tier for few sessions", () => {
    const summary = summarizeSessionHistoryForAi([
      { spotId: "ob", spotName: "Ocean Beach", sessionDate: "2026-05-01", startTime: "07:00", endTime: "09:00", stars: 5, forecastSnapshot: { avg: { surfHeightFt: 4, swellPeriod: 12, score: 80 } } },
    ]);
    assert.equal(summary.tier, "light");
    assert.ok(summary.text.includes("Ocean Beach"));
  });

  it("uses rich tier for many sessions", () => {
    const sessions = Array.from({ length: 12 }, (_, i) => ({
      spotId: "ob",
      spotName: "Ocean Beach",
      sessionDate: `2026-05-${String(i + 1).padStart(2, "0")}`,
      startTime: "07:00",
      endTime: "09:00",
      stars: i % 2 === 0 ? 5 : 4,
      forecastSnapshot: { avg: { surfHeightFt: 4 + i * 0.1, swellPeriod: 12, score: 75 + i } },
    }));
    const summary = summarizeSessionHistoryForAi(sessions);
    assert.equal(summary.tier, "rich");
    assert.ok(summary.text.includes("logged sessions"));
  });
});
