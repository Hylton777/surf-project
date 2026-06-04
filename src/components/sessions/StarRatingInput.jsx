import React from "react";
import { THEME } from "../../theme.js";
function StarRatingInput({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
          style={{
            border: "none",
            background: "transparent",
            cursor: "pointer",
            fontSize: 26,
            lineHeight: 1,
            padding: 0,
            color: n <= value ? "#eab308" : "#cbd5e1",
          }}
        >
          ★
        </button>
      ))}
      <span style={{ fontSize: 11, color: THEME.textSoft, marginLeft: 4 }}>
        {value ? `${value}/5 surf quality` : "Rate the surf (not crowds)"}
      </span>
    </div>
  );
}
export default StarRatingInput;

