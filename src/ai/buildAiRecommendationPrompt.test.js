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

  it("ignores overnight hours even when scores are higher", () => {
    const pts = [
      { time: "2026-01-01T03:00", score: 99 },
      { time: "2026-01-01T04:00", score: 98 },
      { time: "2026-01-01T05:00", score: 97 },
      { time: "2026-01-01T08:00", score: 50 },
      { time: "2026-01-01T09:00", score: 60 },
      { time: "2026-01-01T10:00", score: 70 },
      { time: "2026-01-01T11:00", score: 65 },
      { time: "2026-01-01T12:00", score: 60 },
    ];
    const w = pickBestScoreWindow(pts);
    assert.equal(fmtHour(w.start.time), "09:00");
    assert.ok(w.avgScore < 90);
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
    assert.ok(userMessage.includes("TOP SPOTS — HOURLY FORECASTS"));
    assert.ok(userMessage.includes("app quality score"));
  });

  it("includes session history when provided", () => {
    const spot = {
      id: "ob",
      name: "Ocean Beach",
      type: "Beach Break",
      difficulty: "Intermediate",
      tideStationId: "9414290",
    };
    const { userMessage } = buildAiRecommendationPrompt({
      user: { email: "test@example.com" },
      preferences: { skill: "Intermediate", quiverDesc: "Longboard", driveOrigin: "SF" },
      spots: [spot],
      spotData: { ob: { surfHeightFt: 3, swellPeriod: 12, swellDir: 300, windSpeed: 8, windDir: 270 } },
      tidesByStation: {},
      driveTimes: {},
      activeSpot: spot,
      computeDisplayScore: () => ({ score: 70, rating: "Good", breakdown: {} }),
      surfSessions: [{
        spotId: "ob",
        spotName: "Ocean Beach",
        sessionDate: "2026-05-01",
        startTime: "07:00",
        endTime: "09:00",
        stars: 5,
        forecastSnapshot: { avg: { surfHeightFt: 4, swellPeriod: 12, score: 82 } },
      }],
    });

    assert.ok(userMessage.includes("SESSION HISTORY"));
    assert.ok(userMessage.includes("Ocean Beach"));
  });

  it("includes hourly forecasts for top ranked spots, not just active spot", () => {
    const lindaMar = {
      id: "linda_mar",
      name: "Linda Mar",
      type: "Beach Break",
      difficulty: "Beginner–Inter",
      tideStationId: "9414290",
    };
    const pleasurePoint = {
      id: "pleasure_point",
      name: "Pleasure Point",
      type: "Point Break",
      difficulty: "Intermediate",
      tideStationId: "9413745",
    };
    const hourlyPoint = time => ({
      time,
      surfHeightFt: 3,
      score: 70,
      rating: "Good",
      swellPeriod: 12,
      swellDir: 280,
      windSpeedMph: 6,
      windClassification: "offshore",
      tideFt: 2,
    });
    const spotData = {
      linda_mar: {
        surfHeightFt: 4,
        swellPeriod: 12,
        swellDir: 280,
        windSpeed: 6,
        windDir: 270,
        dayForecastPoints: [hourlyPoint("2026-01-01T08:00"), hourlyPoint("2026-01-01T09:00")],
      },
      pleasure_point: {
        surfHeightFt: 3,
        swellPeriod: 11,
        swellDir: 290,
        windSpeed: 8,
        windDir: 260,
        dayForecastPoints: [hourlyPoint("2026-01-01T10:00")],
      },
    };
    const computeDisplayScore = (spot, data) => ({
      score: spot.id === "linda_mar" ? 80 : 65,
      rating: "Good",
      breakdown: { heightScore: 80, periodScore: 80, directionScore: 80, windScore: 80, tideScore: 70, windClassification: "offshore" },
    });

    const { system, userMessage } = buildAiRecommendationPrompt({
      user: null,
      preferences: { skill: "Intermediate", quiverDesc: "Longboard", driveOrigin: "SF" },
      spots: [lindaMar, pleasurePoint],
      spotData,
      tidesByStation: {},
      driveTimes: {},
      activeSpot: pleasurePoint,
      computeDisplayScore,
      rankedSpots: [lindaMar, pleasurePoint],
    });

    assert.ok(userMessage.includes("TOP SPOTS — HOURLY FORECASTS"));
    assert.ok(userMessage.includes("#1 Linda Mar"));
    assert.ok(userMessage.includes("Peak hourly window"));
    assert.ok(userMessage.includes("never another spot's hourly series"));
    assert.ok(userMessage.includes("6:00 AM and 20:00 PM"));
    assert.ok(system.includes("never suggest pre-dawn"));
  });
});
