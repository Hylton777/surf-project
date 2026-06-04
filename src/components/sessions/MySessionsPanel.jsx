import React from "react";
import { THEME } from "../../theme.js";
import { fmtSurfFt } from "../../lib/format.js";
function MySessionsPanel({ sessions, onClose, onDelete, boardNameForId }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10, 63, 82, 0.45)",
        display: "flex",
        alignItems: "stretch",
        justifyContent: "flex-end",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: THEME.panel,
          borderLeft: `1px solid ${THEME.border}`,
          overflowY: "auto",
          padding: "20px 18px",
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 9, letterSpacing: 3, color: THEME.muted }}>HISTORY</div>
            <h3 style={{ margin: "4px 0 0", fontFamily: "'Playfair Display', serif", color: THEME.textStrong }}>My Sessions</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: `1px solid ${THEME.border}`,
              background: THEME.panel,
              borderRadius: 6,
              padding: "6px 10px",
              fontSize: 10,
              cursor: "pointer",
              color: THEME.textSoft,
              fontFamily: "'Space Mono', monospace",
            }}
          >
            CLOSE
          </button>
        </div>

        {!sessions.length ? (
          <div style={{ fontSize: 12, color: THEME.textSoft, lineHeight: 1.5 }}>
            No sessions logged yet. Use &quot;I surfed here today&quot; below any spot forecast.
          </div>
        ) : (
          sessions.map(session => {
            const snap = session.forecastSnapshot?.avg;
            return (
              <div
                key={session.id}
                style={{
                  border: `1px solid ${THEME.border}`,
                  borderRadius: 8,
                  padding: "12px 14px",
                  marginBottom: 10,
                  background: THEME.bgSoft,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: THEME.textStrong }}>{session.spotName}</div>
                  <div style={{ fontSize: 14, color: "#eab308", letterSpacing: 1 }}>
                    {"★".repeat(session.stars)}{"☆".repeat(5 - session.stars)}
                  </div>
                </div>
                <div style={{ fontSize: 10, color: THEME.textSoft, fontFamily: "'Space Mono', monospace", marginBottom: 4 }}>
                  {session.sessionDate} · {session.startTime}–{session.endTime}
                </div>
                <div style={{ fontSize: 10, color: THEME.textSoft, marginBottom: 6 }}>
                  {boardNameForId(session.boardId)}
                  {snap ? ` · ${fmtSurfFt(snap.surfHeightFt)}ft @ ${snap.swellPeriod?.toFixed?.(0) || snap.swellPeriod}s · score ${snap.score ?? "—"}` : ""}
                </div>
                <button
                  type="button"
                  onClick={() => onDelete(session.id)}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "#dc2626",
                    fontSize: 9,
                    letterSpacing: 1,
                    cursor: "pointer",
                    fontFamily: "'Space Mono', monospace",
                    padding: 0,
                  }}
                >
                  DELETE
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
export default MySessionsPanel;

