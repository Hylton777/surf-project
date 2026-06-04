export const getCurrentHourIdx = times => {
  if (!times?.length) return 0;
  const now = Date.now();
  let idx = 0;
  for (let i = 0; i < times.length; i++) {
    if (new Date(times[i]).getTime() <= now) idx = i;
    else break;
  }
  return Math.max(0, idx);
};

/** Match the forecast hour in `secondaryTimes` to `primaryTimes[hi]` so wave vs wind stay the same clock hour. */
export const alignHourIdx = (primaryTimes, secondaryTimes, hi) => {
  if (!primaryTimes?.length || !secondaryTimes?.length) return hi;
  const t = primaryTimes[hi];
  if (t == null) return Math.min(Math.max(0, hi), secondaryTimes.length - 1);
  const j = secondaryTimes.indexOf(t);
  return j !== -1 ? j : Math.min(Math.max(0, hi), secondaryTimes.length - 1);
};

export const parseHourTimeMs = s => {
  const m = String(s || "").match(/(\d{4})-(\d{2})-(\d{2})[\sT](\d{2}):(\d{2})/);
  if (!m) return NaN;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
};
