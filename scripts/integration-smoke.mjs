/**
 * End-to-end smoke tests: forecast pipeline, import audit, component SSR render.
 * Run: node --test scripts/integration-smoke.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import React from "react";
import { renderToString } from "react-dom/server";

import { SPOTS } from "../src/data/defaultSpots.js";
import { fetchMarine, fetchWind, todayForecastDate } from "../src/services/openMeteo.js";
import { fetchTides } from "../src/services/tides.js";
import { fetchNdbcSpecUpstream } from "../server/ndbc-upstream.mjs";
import { getNdbcStationIdForSpot } from "../src/forecast/spotRegistry.js";
import { buildSpotDataMapForDate, rankSpots, computeDisplayScore } from "../src/forecast/spotRanking.js";
import { getRatingDisplayColor } from "../src/lib/ratings.js";
import { degToCompass, fmtSurfFt } from "../src/lib/format.js";

import Dashboard from "../src/pages/Dashboard.jsx";
import SetupScreen from "../src/pages/SetupScreen.jsx";
import LoadingScreen from "../src/pages/LoadingScreen.jsx";
import ForecastDateNav from "../src/components/ForecastDateNav.jsx";
import WaveForecastChart from "../src/components/charts/WaveForecastChart.jsx";
import TideChart from "../src/components/charts/TideChart.jsx";
import { getSpotScoringConfig } from "../src/forecast/spotRegistry.js";

const LIB_SYMBOLS = [
  "degToCompass",
  "fmtSurfFt",
  "getRatingDisplayColor",
  "formatForecastCenterLabel",
  "formatForecastNavDate",
  "computeDisplayScore",
  "roundHalfFt",
  "parseHourTimeMs",
  "buildCurvePointsForDay",
];

function walkJsx(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walkJsx(p, out);
    else if (/\.jsx$/.test(entry.name)) out.push(p);
  }
  return out;
}

function missingImportsForFile(file) {
  const code = fs.readFileSync(file, "utf8");
  const imported = new Set();
  for (const m of code.matchAll(/^import\s+([^;]+);/gm)) {
    for (const sym of LIB_SYMBOLS) {
      if (new RegExp(`\\b${sym}\\b`).test(m[1])) imported.add(sym);
    }
  }
  return LIB_SYMBOLS.filter(
    sym =>
      new RegExp(`\\b${sym}\\b`).test(code) &&
      !imported.has(sym) &&
      !new RegExp(`(?:function|const)\\s+${sym}\\b`).test(code)
  );
}

describe("import audit (post-split regression guard)", () => {
  it("all JSX files import shared lib symbols they use", () => {
    const jsxFiles = walkJsx(path.join(process.cwd(), "src"));
    const problems = jsxFiles
      .map(file => ({ file: path.relative(process.cwd(), file), missing: missingImportsForFile(file) }))
      .filter(r => r.missing.length);
    assert.equal(
      problems.length,
      0,
      problems.map(p => `${p.file}: ${p.missing.join(", ")}`).join("\n")
    );
  });
});

describe("forecast load pipeline", () => {
  it("fetches and builds conditions for all default spots", async () => {
    const spots = SPOTS;
    const marines = await Promise.all(spots.map(s => fetchMarine(s.lat, s.lon).catch(() => null)));
    const winds = await Promise.all(
      marines.map((m, i) => fetchWind(m?.latitude ?? spots[i].lat, m?.longitude ?? spots[i].lon).catch(() => null))
    );

    const uniqueTideIds = [...new Set(spots.map(s => s.tideStationId).filter(Boolean))];
    const tideJsons = await Promise.all(
      uniqueTideIds.map(id => fetchTides(id).catch(() => ({ predictions: [] })))
    );
    const tidesByStation = {};
    uniqueTideIds.forEach((id, i) => {
      tidesByStation[id] = tideJsons[i]?.predictions || [];
    });

    const ndbcIds = [...new Set(spots.map(s => getNdbcStationIdForSpot(s)).filter(Boolean))];
    const buoyByStation = {};
    for (const id of ndbcIds) {
      const r = await fetchNdbcSpecUpstream(id);
      buoyByStation[id] = r.ok ? { hsM: 1.2, ageMinutes: 30 } : null;
    }

    const today = todayForecastDate();
    const rawBySpot = {};
    spots.forEach((spot, i) => {
      rawBySpot[spot.id] = { marine: marines[i], wind: winds[i] };
    });

    const spotData = buildSpotDataMapForDate(spots, rawBySpot, buoyByStation, tidesByStation, today);
    assert.equal(Object.keys(spotData).length, spots.length, "every spot should produce forecast data");

    const ranked = rankSpots(spots, spotData, tidesByStation, {}, []);
    assert.equal(ranked.length, spots.length);

    for (const spot of spots) {
      const score = computeDisplayScore(spot, spotData[spot.id], tidesByStation);
      assert.ok(score?.rating, `${spot.shortName} should have a rating`);
      assert.ok(Number.isFinite(score?.score), `${spot.shortName} should have a score`);
      assert.ok(getSpotScoringConfig(spot), `${spot.shortName} should have scoring config`);
    }
  });
});

describe("component SSR render (crash guard)", () => {
  it("renders setup and loading screens", () => {
    assert.doesNotThrow(() =>
      renderToString(
        React.createElement(SetupScreen, {
          skill: "Intermediate",
          setSkill: () => {},
          quiver: ["longboard"],
          toggleBoard: () => {},
          customBoard: "",
          setCustomBoard: () => {},
          driveOrigin: "San Francisco, CA",
          setDriveOrigin: () => {},
          driveOriginStatus: "",
          driveOriginOptions: [],
          driveOriginOptionsLoading: false,
          showDriveOriginOptions: false,
          onDriveOriginFocus: () => {},
          onDriveOriginSelect: () => {},
          onDriveOriginBlur: () => {},
          onSubmit: () => {},
        })
      )
    );
    assert.doesNotThrow(() => renderToString(React.createElement(LoadingScreen, { spotCount: 8 })));
  });

  it("renders dashboard with live-shaped forecast data", async () => {
    const spots = SPOTS;
    const marines = await Promise.all(spots.map(s => fetchMarine(s.lat, s.lon).catch(() => null)));
    const winds = await Promise.all(
      marines.map((m, i) => fetchWind(m?.latitude ?? spots[i].lat, m?.longitude ?? spots[i].lon).catch(() => null))
    );
    const uniqueTideIds = [...new Set(spots.map(s => s.tideStationId).filter(Boolean))];
    const tideJsons = await Promise.all(
      uniqueTideIds.map(id => fetchTides(id).catch(() => ({ predictions: [] })))
    );
    const tidesByStation = {};
    uniqueTideIds.forEach((id, i) => {
      tidesByStation[id] = tideJsons[i]?.predictions || [];
    });
    const today = todayForecastDate();
    const rawBySpot = {};
    spots.forEach((spot, i) => {
      rawBySpot[spot.id] = { marine: marines[i], wind: winds[i] };
    });
    const spotData = buildSpotDataMapForDate(spots, rawBySpot, {}, tidesByStation, today);
    const activeSpot = rankSpots(spots, spotData, tidesByStation, {}, [])[0];
    const data = spotData[activeSpot.id];

    assert.doesNotThrow(() =>
      renderToString(
        React.createElement(Dashboard, {
          user: null,
          onLogin: () => {},
          onLogout: () => {},
          onChangePreferences: () => {},
          spots,
          spotData,
          driveTimes: {},
          activeSpot,
          setActiveSpot: () => {},
          tidesByStation,
          aiRec: { text: "", loading: false, retryAttempt: 1, maxAttempts: 1 },
          aiCalled: false,
          skill: "Intermediate",
          quiver: ["longboard", "shortboard"],
          onGenerateAi: () => {},
          addSpotOpen: false,
          setAddSpotOpen: () => {},
          addSpotName: "",
          setAddSpotName: () => {},
          addSpotStatus: "",
          addSpotLoading: false,
          onAddSpot: () => {},
          surfSessions: [],
          logSessionOpen: false,
          setLogSessionOpen: () => {},
          mySessionsOpen: false,
          setMySessionsOpen: () => {},
          onSaveSession: async () => {},
          onDeleteSession: async () => {},
          getSpotScoringConfig,
          forecastDate: today,
          onForecastDateChange: () => {},
        })
      )
    );

    assert.doesNotThrow(() =>
      renderToString(
        React.createElement(ForecastDateNav, { date: today, onChange: () => {} })
      )
    );

    assert.doesNotThrow(() =>
      renderToString(
        React.createElement(WaveForecastChart, {
          points: data.dayForecastPoints,
          times: data.dayTimes,
          heights: data.daySurfHeights ?? data.dayWaveHeights,
          dateStr: today,
          syncMs: data.dayForecastPoints?.[4]?.ms ?? null,
          onSyncHover: () => {},
        })
      )
    );

    assert.doesNotThrow(() =>
      renderToString(
        React.createElement(TideChart, {
          tides: tidesByStation[activeSpot.tideStationId] || [],
          dateStr: today,
          syncMs: data.dayForecastPoints?.[4]?.ms ?? null,
          onSyncHover: () => {},
        })
      )
    );
  });
});

describe("shared helpers used by charts", () => {
  it("degToCompass and fmtSurfFt are callable", () => {
    assert.equal(typeof degToCompass(270), "string");
    assert.equal(typeof fmtSurfFt(3.5), "string");
    assert.ok(getRatingDisplayColor("Good"));
  });
});
