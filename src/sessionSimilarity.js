/** Max points added to app quality score from session preference matching. */
export const PREFERENCE_BOOST_MAX = 8;

const MIN_STARS_FOR_BOOST = 4;

const degDiff = (a, b) => {
  const x = Math.abs(((Number(a) - Number(b)) + 540) % 360 - 180);
  return Number.isFinite(x) ? x : 90;
};

/**
 * Compare two condition snapshots (avg blocks). Returns 0–1 similarity.
 */
export const conditionSimilarity = (a, b) => {
  if (!a || !b) return 0;

  const heightDiff = Math.abs((Number(a.surfHeightFt) || 0) - (Number(b.surfHeightFt) || 0)) / 8;
  const periodDiff = Math.abs((Number(a.swellPeriod) || 0) - (Number(b.swellPeriod) || 0)) / 10;
  const dirDiff = degDiff(a.swellDir, b.swellDir) / 90;
  const windDiff = Math.abs((Number(a.windSpeedMph) || 0) - (Number(b.windSpeedMph) || 0)) / 20;
  const scoreDiff = Math.abs((Number(a.score) || 0) - (Number(b.score) || 0)) / 50;

  const dist = heightDiff * 0.35 + periodDiff * 0.2 + dirDiff * 0.2 + windDiff * 0.15 + scoreDiff * 0.1;
  return Math.max(0, 1 - Math.min(1, dist));
};

const starWeight = stars => {
  if (stars >= 5) return 1;
  if (stars >= 4) return 0.85;
  if (stars >= 3) return 0.35;
  return 0;
};

/**
 * Boost score (0–PREFERENCE_BOOST_MAX) when today's conditions resemble past high-rated sessions.
 */
export const computeSpotPreferenceBoost = (spotId, currentAvg, sessions = []) => {
  if (!currentAvg || !sessions.length) return 0;

  let weightedSim = 0;
  let weightSum = 0;

  for (const session of sessions) {
    const w = starWeight(session.stars);
    if (w <= 0 || session.stars < MIN_STARS_FOR_BOOST) continue;

    const snap = session.forecastSnapshot?.avg;
    if (!snap) continue;

    let sim = conditionSimilarity(currentAvg, snap);
    if (session.spotId === spotId) sim *= 1.12;

    weightedSim += sim * w;
    weightSum += w;
  }

  if (weightSum <= 0) return 0;
  const normalized = weightedSim / weightSum;
  return Math.min(PREFERENCE_BOOST_MAX, Math.round(normalized * PREFERENCE_BOOST_MAX * 10) / 10);
};

export const buildCurrentConditionsAvg = (spotDataPoint, scoreResult) => {
  if (!spotDataPoint) return null;
  return {
    surfHeightFt: spotDataPoint.surfHeightFt,
    swellPeriod: spotDataPoint.swellPeriod,
    swellDir: spotDataPoint.swellDir,
    windSpeedMph: spotDataPoint.windSpeed,
    score: scoreResult?.score,
    rating: scoreResult?.rating,
  };
};

/**
 * Sort spots by adjusted score (forecast + preference boost), then drive time.
 */
export const sortSpotsWithPreferences = ({
  spots,
  spotData,
  tidesByStation,
  driveTimes,
  sessions = [],
  computeDisplayScore,
  parseDriveTimeMinutes,
}) =>
  [...spots]
    .map(spot => {
      const data = spotData[spot.id];
      const scoreResult = computeDisplayScore(spot, data, tidesByStation);
      const baseScore = scoreResult?.score ?? -1;
      const currentAvg = buildCurrentConditionsAvg(data, scoreResult);
      const boost = computeSpotPreferenceBoost(spot.id, currentAvg, sessions);
      return {
        spot,
        baseScore,
        adjustedScore: baseScore >= 0 ? baseScore + boost : baseScore,
        preferenceBoost: boost,
      };
    })
    .sort((a, b) => {
      if (b.adjustedScore !== a.adjustedScore) return b.adjustedScore - a.adjustedScore;
      const aDrive = parseDriveTimeMinutes(driveTimes[a.spot.id]);
      const bDrive = parseDriveTimeMinutes(driveTimes[b.spot.id]);
      if (aDrive !== bDrive) return aDrive - bDrive;
      return a.spot.shortName.localeCompare(b.spot.shortName);
    })
    .map(entry => entry.spot);

export const getHighRatedSessions = (sessions, minStars = 4) =>
  (sessions || []).filter(s => Number(s.stars) >= minStars);

/**
 * Summarize session history for AI prompt — scales with data volume.
 */
export const summarizeSessionHistoryForAi = (sessions = [], spotNameById = {}) => {
  const list = sessions || [];
  if (!list.length) return null;

  const high = getHighRatedSessions(list, 4);
  const fmt = s => {
    const snap = s.forecastSnapshot?.avg;
    const spot = s.spotName || spotNameById[s.spotId] || s.spotId;
    const cond = snap
      ? `${snap.surfHeightFt ?? "—"}ft face, ${snap.swellPeriod ?? "—"}s, score ${snap.score ?? "—"}`
      : "conditions unknown";
    return `${spot} on ${s.sessionDate} ${s.startTime}–${s.endTime}: ${s.stars}/5 stars (${cond})`;
  };

  if (list.length <= 3) {
    return {
      tier: "light",
      text: `Past sessions you logged (surf quality, not crowds):\n${list.map(fmt).join("\n")}`,
    };
  }

  if (list.length <= 10) {
    const recent = list.slice(0, 8).map(fmt).join("\n");
    const highLines = high.slice(0, 5).map(fmt).join("\n");
    return {
      tier: "medium",
      text: [
        `You have ${list.length} logged sessions. Weight 4–5★ days when they resemble today's forecast.`,
        `Recent sessions:\n${recent}`,
        high.length ? `Best-rated sessions:\n${highLines}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    };
  }

  const avgHeight =
    high.reduce((s, x) => s + (Number(x.forecastSnapshot?.avg?.surfHeightFt) || 0), 0) /
    (high.length || 1);
  const avgPeriod =
    high.reduce((s, x) => s + (Number(x.forecastSnapshot?.avg?.swellPeriod) || 0), 0) /
    (high.length || 1);
  const avgScore =
    high.reduce((s, x) => s + (Number(x.forecastSnapshot?.avg?.score) || 0), 0) / (high.length || 1);

  const spotCounts = {};
  for (const s of high) {
    const key = s.spotName || spotNameById[s.spotId] || s.spotId;
    spotCounts[key] = (spotCounts[key] || 0) + 1;
  }
  const favSpots = Object.entries(spotCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, n]) => `${name} (${n}× 4–5★)`)
    .join(", ");

  return {
    tier: "rich",
    text: [
      `${list.length} logged sessions total; ${high.length} rated 4–5★ for surf quality.`,
      `On your best days you typically surf ~${avgHeight.toFixed(1)}ft face, ~${avgPeriod.toFixed(0)}s period, app score ~${Math.round(avgScore)}.`,
      favSpots ? `Favorite spots when conditions clicked: ${favSpots}.` : "",
      `When today's forecast at a spot resembles those 4–5★ sessions, lean that way — but forecast scores still come first.`,
      `Recent high-rated:\n${high.slice(0, 6).map(fmt).join("\n")}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
};
