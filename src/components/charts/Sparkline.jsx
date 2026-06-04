import React from "react";
import { THEME } from "../../theme.js";
import { fmtSurfFt } from "../../lib/format.js";
function Sparkline({ data, color = THEME.accent, height = 48 }) {
  if (!data?.length) return <svg width="100%" height={height} />;
  const W = 300;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = height - ((v - min) / range) * (height - 6) - 3;
    return [x, y];
  });
  let path = `M ${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const cx = (x0 + x1) / 2;
    path += ` C ${cx},${y0} ${cx},${y1} ${x1},${y1}`;
  }
  const fill = path + ` L ${W},${height} L 0,${height} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} style={{ width: "100%", height }}>
      <defs>
        <linearGradient id={`sg-${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={fill} fill={`url(#sg-${color.replace("#","")})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Min/max labels */}
      <text x={pts[data.indexOf(max)][0]} y={pts[data.indexOf(max)][1] - 4}
        textAnchor="middle" fontSize="8" fill={color} opacity="0.8">{fmtSurfFt(max)}ft</text>
    </svg>
  );
}
export default Sparkline;

