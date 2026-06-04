import React from "react";
import { THEME } from "../theme.js";
import {
  getForecastDateBounds,
  shiftForecastDate,
  formatForecastCenterLabel,
  formatForecastNavDate,
} from "../services/openMeteo.js";
function ForecastDateNav({ date, onChange, compact = false }) {
  const { min, max } = getForecastDateBounds();
  const prevDate = shiftForecastDate(date, -1);
  const nextDate = shiftForecastDate(date, 1);
  const canPrev = date > min;
  const canNext = date < max;

  const btnStyle = disabled => ({
    border: `1px solid ${THEME.border}`,
    background: disabled ? THEME.bgSoft : THEME.panel,
    color: disabled ? THEME.muted : THEME.accent,
    borderRadius: 5,
    padding: compact ? "2px 5px" : "4px 8px",
    fontSize: compact ? 8 : 9,
    letterSpacing: 0.5,
    cursor: disabled ? "default" : "pointer",
    fontFamily: "'Space Mono', monospace",
    lineHeight: 1.2,
    whiteSpace: "nowrap",
  });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 4,
        marginTop: compact ? 6 : 0,
      }}
      onClick={e => e.stopPropagation()}
    >
      <button
        type="button"
        disabled={!canPrev}
        onClick={() => canPrev && onChange(prevDate)}
        title={canPrev ? formatForecastCenterLabel(prevDate) : "Earliest available day"}
        style={btnStyle(!canPrev)}
      >
        ← {formatForecastNavDate(prevDate)}
      </button>
      <span
        style={{
          fontSize: compact ? 8 : 9,
          color: THEME.textStrong,
          fontFamily: "'Space Mono', monospace",
          fontWeight: 700,
          textAlign: "center",
          flex: 1,
          minWidth: 0,
        }}
      >
        {formatForecastCenterLabel(date)}
      </span>
      <button
        type="button"
        disabled={!canNext}
        onClick={() => canNext && onChange(nextDate)}
        title={canNext ? formatForecastCenterLabel(nextDate) : "Latest available day"}
        style={btnStyle(!canNext)}
      >
        {formatForecastNavDate(nextDate)} →
      </button>
    </div>
  );
}
export default ForecastDateNav;

