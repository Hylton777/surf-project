const getDayWindowMs = dateStr => {
  const dateParts = String(dateStr || "").match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!dateParts) return null;
  const start = new Date(+dateParts[1], +dateParts[2] - 1, +dateParts[3]).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  return { start, end: start + dayMs, dayMs };
};

const interpolateSeriesAt = (sortedPoints, ms, valueKey) => {
  if (!sortedPoints.length || !Number.isFinite(ms)) return null;
  if (ms <= sortedPoints[0].ms) return sortedPoints[0][valueKey];
  if (ms >= sortedPoints[sortedPoints.length - 1].ms) return sortedPoints[sortedPoints.length - 1][valueKey];
  for (let i = 0; i < sortedPoints.length - 1; i++) {
    const a = sortedPoints[i];
    const b = sortedPoints[i + 1];
    if (ms >= a.ms && ms <= b.ms) {
      const span = b.ms - a.ms;
      if (span <= 0) return a[valueKey];
      const t = (ms - a.ms) / span;
      return a[valueKey] + t * (b[valueKey] - a[valueKey]);
    }
  }
  return null;
};

const buildCurvePointsForDay = (sortedPoints, dateStr, valueKey) => {
  const window = getDayWindowMs(dateStr);
  if (!window || !sortedPoints.length) {
    return { window, inWindow: [], curvePoints: [] };
  }
  const { start, end } = window;
  const inWindow = sortedPoints.filter(p => p.ms >= start && p.ms <= end);
  if (!inWindow.length) return { window, inWindow: [], curvePoints: [] };

  const before = sortedPoints.filter(p => p.ms < start).slice(-1);
  const after = sortedPoints.filter(p => p.ms > end).slice(0, 1);
  const curvePoints = [...before, ...inWindow, ...after];

  const startVal = interpolateSeriesAt(sortedPoints, start, valueKey);
  const endVal = interpolateSeriesAt(sortedPoints, end, valueKey);
  if (curvePoints[0].ms > start && Number.isFinite(startVal)) {
    curvePoints.unshift({ ms: start, [valueKey]: startVal, synthetic: true });
  }
  if (curvePoints[curvePoints.length - 1].ms < end && Number.isFinite(endVal)) {
    curvePoints.push({ ms: end, [valueKey]: endVal, synthetic: true });
  }

  return { window, inWindow, curvePoints };
};
export { getDayWindowMs, interpolateSeriesAt, buildCurvePointsForDay };

