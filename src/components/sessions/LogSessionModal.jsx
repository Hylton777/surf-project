import React, { useState, useEffect } from "react";
import { THEME } from "../../theme.js";
import { BOARDS } from "../../data/defaultSpots.js";
import { computeSurfScore } from "../../forecast/surfScorer.js";
import { resolveSessionForecastSnapshot, todayInTimeZone } from "../../sessions/sessionForecast.js";
import StarRatingInput from "./StarRatingInput.jsx";
function LogSessionModal({
  spot,
  quiver,
  spotData,
  getSpotScoringConfig,
  onClose,
  onSave,
}) {
  const [sessionDate, setSessionDate] = useState(todayInTimeZone());
  const [startTime, setStartTime] = useState("07:00");
  const [endTime, setEndTime] = useState("09:00");
  const [boardId, setBoardId] = useState(quiver[0] || "");
  const [stars, setStars] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const quiverBoards = BOARDS.filter(b => quiver.includes(b.id));

  useEffect(() => {
    if (boardId && quiver.includes(boardId)) return;
    setBoardId(quiver[0] || "");
  }, [quiver, boardId]);

  const handleSubmit = async () => {
    setError("");
    if (!stars) {
      setError("Tap a star rating (1–5).");
      return;
    }
    if (!boardId) {
      setError("Select a board from your quiver.");
      return;
    }
    const startMin = parseInt(startTime.split(":")[0], 10) * 60 + parseInt(startTime.split(":")[1], 10);
    const endMin = parseInt(endTime.split(":")[0], 10) * 60 + parseInt(endTime.split(":")[1], 10);
    if (!Number.isFinite(startMin) || !Number.isFinite(endMin) || endMin < startMin) {
      setError("End time must be after start time.");
      return;
    }

    setSaving(true);
    try {
      const spotConfig = getSpotScoringConfig(spot);
      const forecastSnapshot = await resolveSessionForecastSnapshot({
        spot,
        spotConfig,
        spotData,
        sessionDate,
        startTime,
        endTime,
      });
      if (!forecastSnapshot) {
        setError("Could not load forecast for that date and time. Try a different window.");
        return;
      }
      await onSave({
        id: crypto.randomUUID?.() || `session_${Date.now()}`,
        spotId: spot.id,
        spotName: spot.name,
        sessionDate,
        startTime,
        endTime,
        boardId,
        stars,
        forecastSnapshot,
        createdAt: new Date().toISOString(),
      });
      onClose();
    } catch (e) {
      setError(e?.message || "Failed to save session.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10, 63, 82, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: THEME.panel,
          borderRadius: 10,
          border: `1px solid ${THEME.border}`,
          padding: "22px 24px",
          width: "100%",
          maxWidth: 420,
          boxShadow: "0 12px 40px rgba(15,79,102,0.18)",
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontSize: 9, letterSpacing: 3, color: THEME.muted, marginBottom: 6 }}>LOG SESSION</div>
        <h3 style={{ margin: "0 0 16px", fontFamily: "'Playfair Display', serif", color: THEME.textStrong, fontSize: 22 }}>
          {spot.name}
        </h3>

        <label style={{ display: "block", fontSize: 9, letterSpacing: 2, color: THEME.textSoft, marginBottom: 6 }}>DATE</label>
        <input
          type="date"
          value={sessionDate}
          max={todayInTimeZone()}
          onChange={e => setSessionDate(e.target.value)}
          style={{
            width: "100%",
            boxSizing: "border-box",
            marginBottom: 14,
            padding: "8px 10px",
            borderRadius: 6,
            border: `1px solid ${THEME.border}`,
            fontFamily: "'Space Mono', monospace",
            fontSize: 12,
          }}
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <div>
            <label style={{ display: "block", fontSize: 9, letterSpacing: 2, color: THEME.textSoft, marginBottom: 6 }}>START</label>
            <input
              type="time"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "8px 10px",
                borderRadius: 6,
                border: `1px solid ${THEME.border}`,
                fontFamily: "'Space Mono', monospace",
                fontSize: 12,
              }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 9, letterSpacing: 2, color: THEME.textSoft, marginBottom: 6 }}>END</label>
            <input
              type="time"
              value={endTime}
              onChange={e => setEndTime(e.target.value)}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "8px 10px",
                borderRadius: 6,
                border: `1px solid ${THEME.border}`,
                fontFamily: "'Space Mono', monospace",
                fontSize: 12,
              }}
            />
          </div>
        </div>

        <label style={{ display: "block", fontSize: 9, letterSpacing: 2, color: THEME.textSoft, marginBottom: 8 }}>BOARD</label>
        {quiverBoards.length ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {quiverBoards.map(b => (
              <button
                key={b.id}
                type="button"
                onClick={() => setBoardId(b.id)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: `1px solid ${boardId === b.id ? THEME.accent : THEME.border}`,
                  background: boardId === b.id ? THEME.accentSoft : THEME.panel,
                  color: boardId === b.id ? THEME.accent : THEME.textSoft,
                  fontSize: 10,
                  cursor: "pointer",
                  fontFamily: "'Space Mono', monospace",
                }}
              >
                {b.name}
              </button>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 11, color: THEME.textSoft, marginBottom: 8 }}>No boards in your quiver.</div>
        )}
        <div style={{ fontSize: 10, color: THEME.muted, marginBottom: 14, lineHeight: 1.4 }}>
          Don&apos;t see your board? Update your quiver in Change preferences.
        </div>

        <label style={{ display: "block", fontSize: 9, letterSpacing: 2, color: THEME.textSoft, marginBottom: 8 }}>
          SURF QUALITY
        </label>
        <StarRatingInput value={stars} onChange={setStars} />

        {sessionDate !== todayInTimeZone() && (
          <div style={{ fontSize: 10, color: THEME.textSoft, marginTop: 12, lineHeight: 1.4 }}>
            Loading archived forecast for {sessionDate} to match your rating to conditions you surfed.
          </div>
        )}

        {error && (
          <div style={{ fontSize: 11, color: "#dc2626", marginTop: 12 }}>{error}</div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            style={{
              flex: 1,
              padding: "10px 0",
              borderRadius: 6,
              border: "none",
              background: THEME.accent,
              color: "#fff",
              fontSize: 10,
              letterSpacing: 1.5,
              cursor: saving ? "default" : "pointer",
              fontFamily: "'Space Mono', monospace",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "SAVING…" : "SAVE SESSION"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              flex: 1,
              padding: "10px 0",
              borderRadius: 6,
              border: `1px solid ${THEME.border}`,
              background: THEME.panel,
              color: THEME.textSoft,
              fontSize: 10,
              letterSpacing: 1.5,
              cursor: "pointer",
              fontFamily: "'Space Mono', monospace",
            }}
          >
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );
}
export default LogSessionModal;

