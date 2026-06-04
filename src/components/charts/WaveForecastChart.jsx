import React, { useState } from "react";
import { THEME } from "../../theme.js";
import { fmtSurfFt, degToCompass } from "../../lib/format.js";
import { getRatingDisplayColor } from "../../lib/ratings.js";
import { parseHourTimeMs } from "../../lib/forecastTime.js";
import { buildCurvePointsForDay } from "../../lib/chartCurve.js";
import { roundHalfFt } from "../../forecast/surfForecast.js";
function WaveForecastChart({ points: richPoints, times, heights, dateStr = null, syncMs = null, onSyncHover }) {
  const [hover, setHover] = useState(null);

  const fmtHM = ms => {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const points = (richPoints?.length
    ? richPoints.map(p => ({
        t: p.time,
        ms: Number(p.ms),
        heightFt: Number(p.surfHeightFt),
        rating: p.rating,
        score: p.score,
        swellPeriod: p.swellPeriod,
        swellDir: p.swellDir,
        windSpeedMph: p.windSpeedMph,
        windClassification: p.windClassification,
        tideFt: p.tideFt,
        source: p.source,
      }))
    : (times || []).map((t, i) => ({
        t,
        ms: parseHourTimeMs(t),
        heightFt: Number(heights?.[i]),
      }))
  ).filter(p => Number.isFinite(p.ms) && Number.isFinite(p.heightFt));

  if (!points.length) {
    return <p style={{ color: THEME.textSoft, fontSize: 12 }}>No forecast available.</p>;
  }

  const sortedPoints = [...points].sort((a, b) => a.ms - b.ms);
  const chartDateStr = dateStr || String(sortedPoints[0].t || "").slice(0, 10);
  const { window, inWindow, curvePoints: rawCurvePoints } = buildCurvePointsForDay(sortedPoints, chartDateStr, "heightFt");
  if (!window || !inWindow.length) {
    return <p style={{ color: THEME.textSoft, fontSize: 12 }}>No forecast available.</p>;
  }

  const { start, end, dayMs } = window;

  const W = 420, H = 88;
  const padTop = 30, padBot = 18, padX = 22;
  const innerW = W - 2 * padX;
  const innerH = H - padTop - padBot;
  const curveHeights = rawCurvePoints.map(p => p.heightFt);
  const min = Math.min(...curveHeights) - 0.3;
  const max = Math.max(...curveHeights) + 0.3;
  const safeRange = max - min || 1;
  const xFor = ms => padX + ((ms - start) / dayMs) * innerW;
  const yFor = ft => H - padBot - ((ft - min) / safeRange) * innerH;

  const cps = rawCurvePoints.map(p => ({ ...p, x: xFor(p.ms), y: yFor(p.heightFt) }));

  const segmentPaths = [];
  for (let i = 0; i < cps.length - 1; i++) {
    const x0 = cps[i].x, y0 = cps[i].y;
    const x1 = cps[i + 1].x, y1 = cps[i + 1].y;
    const cx = (x0 + x1) / 2;
    segmentPaths.push({
      d: `M ${x0},${y0} C ${cx},${y0} ${cx},${y1} ${x1},${y1}`,
      color: getRatingDisplayColor(cps[i].rating || cps[i + 1].rating),
    });
  }

  let path = `M ${cps[0].x},${cps[0].y}`;
  for (let i = 1; i < cps.length; i++) {
    const x0 = cps[i - 1].x, y0 = cps[i - 1].y;
    const x1 = cps[i].x, y1 = cps[i].y;
    const cx = (x0 + x1) / 2;
    path += ` C ${cx},${y0} ${cx},${y1} ${x1},${y1}`;
  }

  const nearestPointAtMs = ms => {
    let best = inWindow[0];
    let bestDelta = Math.abs(best.ms - ms);
    for (const p of inWindow) {
      const d = Math.abs(p.ms - ms);
      if (d < bestDelta) {
        best = p;
        bestDelta = d;
      }
    }
    return best;
  };

  const samples = [];
  for (let i = 1; i < cps.length; i++) {
    const x0 = cps[i - 1].x, y0 = cps[i - 1].y;
    const x1 = cps[i].x, y1 = cps[i].y;
    const cx = (x0 + x1) / 2;
    const N = 24;
    for (let k = 0; k <= N; k++) {
      const t = k / N;
      const mt = 1 - t;
      const xs = mt * mt * mt * x0 + 3 * mt * mt * t * cx + 3 * mt * t * t * cx + t * t * t * x1;
      const ys = mt * mt * mt * y0 + 3 * mt * mt * t * y0 + 3 * mt * t * t * y1 + t * t * t * y1;
      samples.push({ x: xs, y: ys });
    }
  }
  samples.sort((a, b) => a.x - b.x);

  const sampleAtX = px => {
    if (!samples.length) return null;
    if (px <= samples[0].x) return samples[0];
    if (px >= samples[samples.length - 1].x) return samples[samples.length - 1];
    let lo = 0, hi = samples.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (samples[mid].x < px) lo = mid;
      else hi = mid;
    }
    const a = samples[lo], b = samples[hi];
    const t = (px - a.x) / ((b.x - a.x) || 1);
    return { x: px, y: a.y + (b.y - a.y) * t };
  };

  const valueFromY = py => min + ((H - padBot - py) / innerH) * safeRange;
  const timeFromX = px => start + ((px - padX) / innerW) * dayMs;

  const onMove = e => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const scale = Math.min(rect.width / W, rect.height / H);
    const xMargin = (rect.width - W * scale) / 2;
    const raw = (e.clientX - rect.left - xMargin) / scale;
    const px = Math.min(Math.max(raw, padX), W - padX);
    const s = sampleAtX(px);
    if (!s) return;
    const ms = timeFromX(px);
    setHover({ x: px, y: s.y, value: valueFromY(s.y), ms, point: nearestPointAtMs(ms) });
    if (onSyncHover) onSyncHover(ms);
  };

  const onLeave = () => {
    setHover(null);
    if (onSyncHover) onSyncHover(null);
  };

  const remoteHover = (() => {
    if (hover) return null;
    if (syncMs == null) return null;
    if (syncMs < start || syncMs > end) return null;
    const px = Math.min(Math.max(xFor(syncMs), padX), W - padX);
    const s = sampleAtX(px);
    if (!s) return null;
    return { x: px, y: s.y, value: valueFromY(s.y), ms: syncMs, point: nearestPointAtMs(syncMs) };
  })();
  const effectiveHover = hover || remoteHover;

  const peakSource = inWindow.reduce((best, p) => (p.heightFt > best.heightFt ? p : best), inWindow[0]);
  const peak = peakSource
    ? { ...peakSource, x: xFor(peakSource.ms), y: yFor(peakSource.heightFt) }
    : null;
  const ticks = ["00:00", "06:00", "12:00", "18:00", "00:00"];
  const hp = effectiveHover?.point;
  const hasRichTooltip = hp && (hp.rating || hp.swellPeriod);
  const tooltipW = hasRichTooltip ? 148 : 64;
  const tooltipH = hasRichTooltip ? 78 : 26;
  const tooltipGap = 8;
  const tooltipX = effectiveHover
    ? Math.min(Math.max(effectiveHover.x - tooltipW / 2, 2), W - tooltipW - 2)
    : 0;
  const tooltipAbove = effectiveHover ? effectiveHover.y - tooltipGap - tooltipH >= 0 : true;
  const tooltipY = effectiveHover
    ? (tooltipAbove ? effectiveHover.y - tooltipGap - tooltipH : effectiveHover.y + tooltipGap)
    : 0;

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: H, display: "block", cursor: "crosshair" }}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
      >
        <defs>
          <linearGradient id="wfg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={THEME.accent} stopOpacity="0.3" />
            <stop offset="100%" stopColor={THEME.accent} stopOpacity="0.02" />
          </linearGradient>
          <clipPath id="waveClip">
            <rect x={padX} y="0" width={innerW} height={H - padBot} />
          </clipPath>
        </defs>
        <g clipPath="url(#waveClip)">
          <path d={path + ` L ${cps[cps.length - 1].x},${H - padBot} L ${cps[0].x},${H - padBot} Z`} fill="url(#wfg)" />
          {segmentPaths.length
            ? segmentPaths.map((seg, idx) => (
                <path
                  key={`seg-${idx}`}
                  d={seg.d}
                  fill="none"
                  stroke={seg.color || THEME.accent}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))
            : (
              <path
                d={path}
                fill="none"
                stroke={THEME.accent}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          {[0.25, 0.5, 0.75].map(f => (
            <line
              key={f}
              x1={padX + f * innerW}
              y1={padTop - 6}
              x2={padX + f * innerW}
              y2={H - padBot}
              stroke={THEME.border}
              strokeOpacity="0.6"
              strokeDasharray="2,3"
              strokeWidth="1"
            />
          ))}
          {peak && (
            <g>
              <circle cx={peak.x} cy={peak.y} r="3" fill={THEME.accent} />
              <text
                x={peak.x}
                y={peak.y - 12}
                textAnchor="middle"
                fontSize="8"
                fill={THEME.textSoft}
              >
                ▲ {fmtSurfFt(peak.heightFt)}ft
              </text>
              <text
                x={peak.x}
                y={peak.y - 4}
                textAnchor="middle"
                fontSize="7"
                fill={THEME.muted}
                fontFamily="'Space Mono', monospace"
              >
                {fmtHM(peak.ms)}
              </text>
            </g>
          )}
        </g>
        {effectiveHover && (
          <g pointerEvents="none">
            <line
              x1={effectiveHover.x}
              y1={padTop - 6}
              x2={effectiveHover.x}
              y2={H - padBot}
              stroke={THEME.accent}
              strokeOpacity="0.5"
              strokeDasharray="2,2"
              strokeWidth="1"
            />
            <circle
              cx={effectiveHover.x}
              cy={effectiveHover.y}
              r="3.5"
              fill="#fff"
              stroke={THEME.accent}
              strokeWidth="1.5"
            />
            <rect
              x={tooltipX}
              y={tooltipY}
              width={tooltipW}
              height={tooltipH}
              rx="3"
              ry="3"
              fill="#ffffff"
              stroke={THEME.accent}
              strokeOpacity="0.5"
              strokeWidth="1"
            />
            <text
              x={tooltipX + tooltipW / 2}
              y={tooltipY + 11}
              textAnchor="middle"
              fontSize="8"
              fill={THEME.text}
              fontFamily="'Space Mono', monospace"
            >
              {fmtHM(effectiveHover.ms)}
              {hasRichTooltip ? ` · ${fmtSurfFt(effectiveHover.value)}ft` : ""}
            </text>
            {!hasRichTooltip && (
              <text
                x={tooltipX + tooltipW / 2}
                y={tooltipY + 21}
                textAnchor="middle"
                fontSize="9"
                fill={THEME.accent}
                fontFamily="'Space Mono', monospace"
                fontWeight="700"
              >
                {fmtSurfFt(effectiveHover.value)}ft
              </text>
            )}
            {hasRichTooltip && (
              <>
                <text
                  x={tooltipX + tooltipW / 2}
                  y={tooltipY + 22}
                  textAnchor="middle"
                  fontSize="8"
                  fill={getRatingDisplayColor(hp.rating)}
                  fontFamily="'Space Mono', monospace"
                  fontWeight="700"
                >
                  {hp.rating || "—"} {Number.isFinite(hp.score) ? `(${Math.round(hp.score)})` : ""}
                </text>
                <text x={tooltipX + tooltipW / 2} y={tooltipY + 34} textAnchor="middle" fontSize="7" fill={THEME.textSoft}>
                  {Number.isFinite(hp.swellPeriod) ? `${hp.swellPeriod.toFixed(0)}s` : "—"} swell{" "}
                  {Number.isFinite(hp.swellDir) ? degToCompass(hp.swellDir) : ""}
                </text>
                <text x={tooltipX + tooltipW / 2} y={tooltipY + 46} textAnchor="middle" fontSize="7" fill={THEME.textSoft}>
                  wind{" "}
                  {Number.isFinite(hp.windSpeedMph) ? `${hp.windSpeedMph.toFixed(0)}mph` : "—"}{" "}
                  {hp.windClassification || ""}
                </text>
                <text x={tooltipX + tooltipW / 2} y={tooltipY + 58} textAnchor="middle" fontSize="7" fill={THEME.textSoft}>
                  tide {Number.isFinite(hp.tideFt) ? `${hp.tideFt.toFixed(1)}ft` : "—"} ·{" "}
                  {formatForecastSourceLabel(hp.source)}
                </text>
                <text x={tooltipX + tooltipW / 2} y={tooltipY + 70} textAnchor="middle" fontSize="6" fill={THEME.muted}>
                  period/dir from marine model
                </text>
              </>
            )}
          </g>
        )}
        {ticks.map((t, i) => (
          <text
            key={`wf-tick-${i}`}
            x={padX + (i / (ticks.length - 1)) * innerW}
            y={H - 4}
            textAnchor="middle"
            fontSize="9"
            fill={THEME.textSoft}
            fontFamily="'Space Mono', monospace"
          >
            {t}
          </text>
        ))}
      </svg>
    </div>
  );
}

const formatForecastSourceLabel = source => {
  const s = String(source || "model");
  if (s === "blend" || s === "buoy") return "NDBC blend";
  if (s === "model+anchor") return "model + buoy anchor";
  return "model";
};

export default WaveForecastChart;

