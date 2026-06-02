/**
 * Builds detailed AI coach prompts from app scoring + user preferences.
 */

const degToCompass = deg => {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
};

const fmtFt = ft => {
  const n = Number(ft);
  if (!Number.isFinite(n)) return "—";
  const rounded = Math.round(n * 2) / 2;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};

const fmtHour = timeStr => {
  const m = String(timeStr || "").match(/(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : String(timeStr || "").slice(11, 16) || "—";
};

const skillLevelRank = skill => {
  const s = String(skill || "").toLowerCase();
  if (s.includes("expert")) return 4;
  if (s === "advanced") return 3;
  if (s.includes("intermediate") || s.includes("inter")) return 2;
  if (s.includes("beginner")) return 1;
  return 2;
};

const spotDifficultyRank = difficulty => {
  const d = String(difficulty || "").toLowerCase();
  if (d.includes("expert")) return 4;
  if (d === "advanced" || d === "intermediate") return 3;
  if (d.includes("beginner")) return 1;
  return 2;
};

const formatBreakdown = breakdown => {
  if (!breakdown) return "";
  const tide =
    breakdown.tideScore == null ? "tide n/a" : `tide ${breakdown.tideScore}`;
  return `height ${breakdown.heightScore}, period ${breakdown.periodScore}, direction ${breakdown.directionScore}, wind ${breakdown.windScore} (${breakdown.windClassification || "?"}), ${tide}`;
};

const formatHourlyLine = p => {
  if (!p) return "";
  const wind = Number.isFinite(p.windSpeedMph)
    ? `${p.windSpeedMph.toFixed(0)}mph ${p.windClassification || ""}`
    : "wind —";
  const tide = Number.isFinite(p.tideFt) ? `${p.tideFt.toFixed(1)}ft tide` : "tide —";
  return (
    `${fmtHour(p.time)} — ${fmtFt(p.surfHeightFt)}ft face, ${p.rating || "—"} (score ${p.score ?? "—"}), ` +
    `${Number(p.swellPeriod)?.toFixed(0) || "—"}s from ${degToCompass(p.swellDir)}, ${wind}, ${tide}`
  );
};

/** Pick 2–3 hour window with highest average hourly score. */
export const pickBestScoreWindow = (dayForecastPoints = []) => {
  const pts = dayForecastPoints.filter(p => Number.isFinite(p.score));
  if (!pts.length) return null;
  if (pts.length <= 2) {
    return { start: pts[0], end: pts[pts.length - 1], avgScore: pts[0].score };
  }
  let best = null;
  const windowSize = 3;
  for (let i = 0; i <= pts.length - windowSize; i++) {
    const slice = pts.slice(i, i + windowSize);
    const avg = slice.reduce((s, p) => s + p.score, 0) / slice.length;
    if (!best || avg > best.avgScore) {
      best = { start: slice[0], end: slice[slice.length - 1], avgScore: avg };
    }
  }
  return best;
};

const formatSpotBlock = ({ spot, data, scoreResult, driveTime, rank, userSkill }) => {
  if (!spot || !data) return `${rank}. ${spot?.name || "Unknown"}: no data`;

  const score = scoreResult?.score ?? "—";
  const rating = scoreResult?.rating ?? "—";
  const breakdown = formatBreakdown(scoreResult?.breakdown);
  const skillGap = spotDifficultyRank(spot.difficulty) - skillLevelRank(userSkill);
  const skillNote =
    skillGap >= 2
      ? "CAUTION: spot difficulty exceeds surfer skill — mention risk or suggest mellower alternative"
      : skillGap >= 1
        ? "spot is a step up from surfer skill — be conservative"
        : "skill level appropriate";

  const lines = [
    `#${rank} ${spot.name} (${spot.type}, spot difficulty: ${spot.difficulty})`,
    `  App quality score: ${score}/100 (${rating}) — primary ranking signal`,
    `  Component scores: ${breakdown}`,
    `  Now: ${fmtFt(data.surfHeightFt)}ft face (${data.surfHeightDescriptor || "—"}), ${Number(data.swellPeriod)?.toFixed(0) || "—"}s swell from ${degToCompass(data.swellDir)} (${Math.round(data.swellDir || 0)}°)`,
    `  Wind: ${Number(data.windSpeed)?.toFixed(0) || "—"}mph from ${degToCompass(data.windDir)}`,
    `  Forecast source (now): ${data.forecastSource || "model"}${data.buoyHsFt != null ? `, buoy ${fmtFt(data.buoyHsFt)}ft` : ""}`,
    `  Drive from start: ${driveTime || "unknown"}`,
    `  Surfer fit: ${skillNote}`,
  ];
  return lines.join("\n");
};

const formatTideBlock = (spots, tidesByStation) =>
  spots
    .map(s => {
      const preds = tidesByStation?.[s.tideStationId] || [];
      const line = preds
        .slice(0, 10)
        .map(t => `${t.t}: ${t.type === "H" ? "High" : "Low"} ${parseFloat(t.v).toFixed(1)}ft`)
        .join(", ");
      return `${s.name} — NOAA ${s.tideStationId}: ${line || "no predictions"}`;
    })
    .join("\n");

/**
 * @param {object} params
 * @param {object|null} params.user
 * @param {{ skill: string, quiverDesc: string, customBoard?: string, driveOrigin: string }} params.preferences
 * @param {object[]} params.spots
 * @param {Record<string, object>} params.spotData
 * @param {Record<string, object[]>} params.tidesByStation
 * @param {Record<string, string>} params.driveTimes
 * @param {object} params.activeSpot
 * @param {(spot: object, data: object, tides: object) => object|null} params.computeDisplayScore
 * @param {object[]} params.rankedSpots optional pre-sorted; if omitted, uses spots order
 */
export function buildAiRecommendationPrompt({
  user,
  preferences,
  spots,
  spotData,
  tidesByStation,
  driveTimes,
  activeSpot,
  computeDisplayScore,
  rankedSpots,
}) {
  const { skill, quiverDesc, customBoard, driveOrigin } = preferences;
  const ordered =
    rankedSpots ||
    [...spots].sort((a, b) => {
      const aS = computeDisplayScore(a, spotData[a.id], tidesByStation)?.score ?? -1;
      const bS = computeDisplayScore(b, spotData[b.id], tidesByStation)?.score ?? -1;
      return bS - aS;
    });

  const spotRankings = ordered
    .map((spot, i) => {
      const data = spotData[spot.id];
      const scoreResult = computeDisplayScore(spot, data, tidesByStation);
      return formatSpotBlock({
        spot,
        data,
        scoreResult,
        driveTime: driveTimes[spot.id],
        rank: i + 1,
        userSkill: skill,
      });
    })
    .join("\n\n");

  const activeData = activeSpot ? spotData[activeSpot.id] : null;
  const activeScore = activeSpot ? computeDisplayScore(activeSpot, activeData, tidesByStation) : null;
  let activeSection = "";
  if (activeSpot && activeData) {
    const hourly = (activeData.dayForecastPoints || [])
      .map(formatHourlyLine)
      .filter(Boolean)
      .join("\n");
    const bestWindow = pickBestScoreWindow(activeData.dayForecastPoints);
    const windowLine = bestWindow
      ? `Suggested peak quality window (by hourly app scores): ${fmtHour(bestWindow.start.time)}–${fmtHour(bestWindow.end.time)} (avg score ${Math.round(bestWindow.avgScore)})`
      : "";

    activeSection = [
      `USER IS VIEWING: ${activeSpot.name}`,
      formatSpotBlock({
        spot: activeSpot,
        data: activeData,
        scoreResult: activeScore,
        driveTime: driveTimes[activeSpot.id],
        rank: "—",
        userSkill: skill,
      }),
      windowLine,
      "24-hour forecast at this spot (hourly face height + app quality score):",
      hourly || "  (no hourly series)",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  const twelveHourSeries = activeData?.forecastWave?.length
    ? activeData.forecastWave.map((ft, i) => `${i}h+${fmtFt(ft)}ft`).join(", ")
    : null;

  const system = `You are an expert Bay Area surf coach writing directly to the surfer. Address them only in second person ("you", "your") — never use their name, email, or third person ("the surfer", "they"). Recommendations MUST use the app's quality scores (0–100) and component breakdowns as the primary signal — not raw swell height alone. Respect their skill level and quiver. Do not recommend expert-only breaks to beginners. Prefer higher-ranked spots unless drive time or skill makes a lower-ranked spot clearly better. Use real surf lingo. Be direct and specific with numbers from the data.`;

  const userMessage = `Give a concise session recommendation for today. Write entirely in second person (you/your). Do not use my name or email.

SURFER PROFILE
- Skill: ${skill}
- Quiver: ${quiverDesc}${customBoard?.trim() ? ` (also: ${customBoard.trim()})` : ""}
- Start location (drive times calculated from here): ${driveOrigin || "not set"}
${user ? "- Logged in (preferences saved)" : "- Guest session (preferences apply this visit only)"}

SPOT RANKINGS (sorted by app quality score — #1 is best conditions right now)
${spotRankings}

${activeSection ? `ACTIVE SPOT DETAIL\n${activeSection}\n` : ""}
${twelveHourSeries ? `Next 12h face-height trend at active spot (from now): ${twelveHourSeries}\n` : ""}
TIDE SCHEDULE (nearest NOAA station per spot)
${formatTideBlock(spots, tidesByStation)}

Provide exactly these 5 sections, each as its own paragraph starting with the bold header:
**Best Spot** — pick using rankings + skill + drive; cite score/rating and why it beats alternatives.
**Best Window** — exact time range today using tide schedule and hourly scores (especially active spot if provided).
**Board Pick** — which board from your quiver to grab, with technical reason tied to size, period, and skill.
**In the Water** — crowds, hazards, vibe; 2–3 sentences.
**Local Tip** — one insider tip for the chosen spot.

Max 280 words. No preamble or sign-off. Start with **Best Spot**.`;

  return { system, userMessage };
}
