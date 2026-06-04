import React from "react";
import { THEME } from "../theme.js";
function WindCompass({ deg, speed }) {
  const r = 22;
  const rad = (deg - 90) * Math.PI / 180;
  const x2 = 28 + r * Math.cos(rad);
  const y2 = 28 + r * Math.sin(rad);
  return (
    <svg width="56" height="56">
      <circle cx="28" cy="28" r="26" fill="none" stroke={THEME.border} strokeWidth="1" />
      {["N","E","S","W"].map((d, i) => {
        const a = i * 90 * Math.PI / 180;
        return <text key={d} x={28 + 20 * Math.cos(a - Math.PI/2)} y={28 + 20 * Math.sin(a - Math.PI/2) + 3}
          textAnchor="middle" fontSize="7" fill={THEME.textSoft}>{d}</text>;
      })}
      <line x1="28" y1="28" x2={x2} y2={y2} stroke={THEME.accent} strokeWidth="2" strokeLinecap="round" />
      <circle cx="28" cy="28" r="2.5" fill={THEME.accent} />
      <text x="28" y="50" textAnchor="middle" fontSize="7" fill={THEME.textSoft} fontFamily="'Space Mono',monospace">{speed?.toFixed(0)}mph</text>
    </svg>
  );
}
export default WindCompass;

