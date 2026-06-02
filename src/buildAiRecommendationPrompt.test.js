import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAiRecommendationPrompt, pickBestScoreWindow } from "./buildAiRecommendationPrompt.js";

describe("pickBestScoreWindow", () => {
  it("returns highest average 3-hour window", () => {
    const pts = [
      { time: "2026-01-01T08:00", score: 40 },
      { time: "2026-01-01T09:00", score: 50 },
      { time: "2026-01-01T10:00", score: 90 },
      { time: "2026-01-01T11:00", score: 85 },
      { time: "2026-01-01T12:00", score: 80 },
    ];
    const w = pickBestScoreWindow(pts);
    assert.equal(fmtHour(w.start.time), "10:00");
    assert.ok(w.avgScore >= 85);
  });
});

function fmtHour(timeStr) {
  const m = String(timeStr || "").match(/(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : "";
}

describe("buildAiRecommendationPrompt", () => {
  it("includes scores, rankings, and surfer profile", () => {
    const spot = {
      id: "ob",
      name: "Ocean Beach",
      type: "Beach Break",
      difficulty: "Intermediate",
      tideStationId: "9414290",
    };
    const data = {
      surfHeightFt: 3.5,
      swellPeriod: 12,
      swellDir: 300,
      windSpeed: 8,
      windDir: 270,
      forecastSource: "model",
      dayForecastPoints: [
        { time: "2026-01-01T10:00", surfHeightFt: 3, score: 70, rating: "Good", swellPeriod: 12, swellDir: 300, windSpeedMph: 8, windClassification: "offshore", tideFt: 2 },
      ],
    };
    const computeDisplayScore = () => ({
      score: 72,
      rating: "Good",
      breakdown: {
        heightScore: 80,
        periodScore: 85,
        directionScore: 90,
        windScore: 75,
        tideScore: 70,
        windClassification: "offshore",
      },
    });

    const { system, userMessage } = buildAiRecommendationPrompt({
      user: { email: "test@example.com" },
      preferences: {
        skill: "Intermediate",
        quiverDesc: "Longboard, Shortboard",
        driveOrigin: "San Francisco, CA",
      },
      spots: [spot],
      spotData: { ob: data },
      tidesByStation: { 9414290: [{ t: "2026-01-01T12:00", type: "H", v: "5.2" }] },
      driveTimes: { ob: "35 min" },
      activeSpot: spot,
      computeDisplayScore,
    });

    assert.ok(system.includes("second person"));
    assert.ok(userMessage.includes("you/your"));
    assert.ok(!userMessage.includes("test@example.com"));
    assert.ok(userMessage.includes("72/100"));
    assert.ok(userMessage.includes("Longboard"));
    assert.ok(userMessage.includes("San Francisco"));
    assert.ok(userMessage.includes("**Best Spot**"));
    assert.ok(userMessage.includes("hourly app scores"));
  });
});
