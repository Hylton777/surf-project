const getNearestTideValue = tides => {
  if (!Array.isArray(tides) || !tides.length) return null;
  const nowMs = Date.now();
  let best = null;
  for (const t of tides) {
    const ts = new Date(t?.t).getTime();
    const v = Number(t?.v);
    if (!Number.isFinite(ts) || !Number.isFinite(v)) continue;
    const delta = Math.abs(ts - nowMs);
    if (!best || delta < best.delta) best = { delta, value: v };
  }
  return best ? best.value : null;
};

/** Linearly interpolate NOAA hilo predictions to feet MLLW at `ms`. */
const getTideAtTime = (predictions, ms) => {
  if (!Array.isArray(predictions) || !predictions.length || !Number.isFinite(ms)) return null;
  const events = predictions
    .map(p => ({ ts: new Date(p?.t).getTime(), v: Number(p?.v) }))
    .filter(e => Number.isFinite(e.ts) && Number.isFinite(e.v))
    .sort((a, b) => a.ts - b.ts);
  if (!events.length) return null;
  if (ms <= events[0].ts) return events[0].v;
  if (ms >= events[events.length - 1].ts) return events[events.length - 1].v;
  for (let i = 0; i < events.length - 1; i++) {
    const a = events[i];
    const b = events[i + 1];
    if (ms >= a.ts && ms <= b.ts) {
      const span = b.ts - a.ts;
      if (span <= 0) return a.v;
      const t = (ms - a.ts) / span;
      return a.v + t * (b.v - a.v);
    }
  }
  return null;
};
export { getNearestTideValue, getTideAtTime };

