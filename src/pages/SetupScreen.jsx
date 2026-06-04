import React, { useState, useEffect } from "react";
import { FONTS, POSTCARD_BG, THEME } from "../theme.js";
import { BOARDS, SKILLS } from "../data/defaultSpots.js";
function SetupScreen({
  skill,
  setSkill,
  quiver,
  toggleBoard,
  customBoard,
  setCustomBoard,
  driveOrigin,
  setDriveOrigin,
  driveOriginStatus,
  driveOriginOptions,
  driveOriginOptionsLoading,
  showDriveOriginOptions,
  onDriveOriginFocus,
  onDriveOriginSelect,
  onDriveOriginBlur,
  onSubmit,
}) {
  return (
    <div style={{
      height: "100vh",
      backgroundImage: POSTCARD_BG,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      backgroundAttachment: "fixed",
      padding: "18px 20px",
      fontFamily: "'Inter', sans-serif",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      overflow: "hidden",
    }}>
      <style>{FONTS}</style>
      <div style={{ textAlign: "center", marginBottom: 22 }}>
        <div style={{ letterSpacing: 8, fontSize: 9, color: THEME.accent, marginBottom: 10 }}>BAY AREA</div>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 40, color: THEME.textStrong, margin: 0, fontWeight: 700, letterSpacing: -0.6, lineHeight: 1 }}>
          SURF INTEL
        </h1>
        <p style={{ color: THEME.textSoft, fontSize: 12, marginTop: 6, letterSpacing: 0.8 }}>
          Live swell · NOAA tides · AI coaching
        </p>
      </div>

      <div style={{ maxWidth: 680, width: "100%", margin: "0 auto" }}>

        {/* Skill */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 8, letterSpacing: 3, color: THEME.accent, marginBottom: 8 }}>YOUR SKILL LEVEL</div>
          <div style={{ display: "flex", gap: 8 }}>
            {SKILLS.map(s => (
              <button key={s} onClick={() => setSkill(s)} style={{
                flex: 1, padding: "9px 0",
                border: skill === s ? `1px solid ${THEME.accent}` : `1px solid ${THEME.border}`,
                background: skill === s ? THEME.accentSoft : THEME.panel,
                color: skill === s ? THEME.accent : THEME.text,
                borderRadius: 6, fontSize: 11, cursor: "pointer", fontFamily: "'Space Mono', monospace",
                transition: "all 0.15s",
              }}>{s}</button>
            ))}
          </div>
        </div>

        {/* Quiver */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 8, letterSpacing: 3, color: THEME.accent, marginBottom: 8 }}>
            YOUR QUIVER <span style={{ color: THEME.textSoft, letterSpacing: 0, fontFamily: "'Inter', sans-serif", fontSize: 9 }}>— select all you own</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {BOARDS.map(b => {
              const sel = quiver.includes(b.id);
              return (
                <button key={b.id} onClick={() => toggleBoard(b.id)} style={{
                  padding: "10px 10px", textAlign: "left",
                  border: sel ? `1px solid ${THEME.accent}` : `1px solid ${THEME.border}`,
                  background: sel ? THEME.accentSoft : THEME.panel,
                  borderRadius: 8, cursor: "pointer", transition: "all 0.15s",
                }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: sel ? THEME.accent : THEME.text, marginBottom: 2 }}>{b.name}</div>
                  <div style={{ fontSize: 9, color: sel ? "#3a9f95" : THEME.textSoft, fontFamily: "'Space Mono', monospace" }}>{b.size}</div>
                  <div style={{ fontSize: 9, color: THEME.muted, marginTop: 2 }}>{b.desc}</div>
                </button>
              );
            })}
          </div>
          <input
            value={customBoard} onChange={e => setCustomBoard(e.target.value)}
            placeholder={"+ Custom board (e.g. 6'8\" step-up twin)"}
            style={{
              width: "100%", marginTop: 7, padding: "9px 12px", boxSizing: "border-box",
              background: THEME.panel, border: `1px solid ${THEME.border}`,
              borderRadius: 6, color: THEME.text, fontSize: 11, outline: "none",
              fontFamily: "'Space Mono', monospace",
            }}
          />
        </div>

        {/* Drive origin */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 8, letterSpacing: 3, color: THEME.accent, marginBottom: 6 }}>
            YOUR START LOCATION
          </div>
          <input
            value={driveOrigin}
            onChange={e => setDriveOrigin(e.target.value)}
            onFocus={onDriveOriginFocus}
            onBlur={onDriveOriginBlur}
            placeholder={"Enter address or lat,lon (e.g. 37.7749,-122.4194)"}
            style={{
              width: "100%", padding: "9px 12px", boxSizing: "border-box",
              background: THEME.panel, border: `1px solid ${THEME.border}`,
              borderRadius: 6, color: THEME.text, fontSize: 11, outline: "none",
              fontFamily: "'Space Mono', monospace",
            }}
          />
          {showDriveOriginOptions && (
            <div style={{
              marginTop: 6,
              border: `1px solid ${THEME.border}`,
              borderRadius: 6,
              overflow: "hidden",
              background: "rgba(255,255,255,0.95)",
              maxHeight: 120,
              overflowY: "auto",
            }}>
              {driveOriginOptionsLoading ? (
                <div style={{ fontSize: 11, color: THEME.textSoft, padding: "10px 12px" }}>Searching locations...</div>
              ) : driveOriginOptions.length ? (
                driveOriginOptions.map((opt, i) => (
                  <button
                    key={`${opt.label}-${i}`}
                    onMouseDown={e => {
                      e.preventDefault();
                      onDriveOriginSelect(opt);
                    }}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 12px",
                      border: "none",
                      borderBottom: i === driveOriginOptions.length - 1 ? "none" : `1px solid ${THEME.border}`,
                      background: "transparent",
                      color: THEME.text,
                      fontSize: 11,
                      cursor: "pointer",
                      fontFamily: "'Inter', sans-serif",
                    }}
                  >
                    {opt.label}
                  </button>
                ))
              ) : (
                <div style={{ fontSize: 11, color: THEME.textSoft, padding: "10px 12px" }}>No matches yet.</div>
              )}
            </div>
          )}
          <div style={{ fontSize: 9, color: THEME.textSoft, marginTop: 5 }}>{driveOriginStatus || "Drive times will be calculated from this location."}</div>
        </div>

        <button onClick={onSubmit} style={{
          width: "100%", padding: "13px 0", background: THEME.accent, border: "none",
          borderRadius: 8, color: "#ffffff", fontSize: 11, fontWeight: 700,
          letterSpacing: 3, cursor: "pointer", fontFamily: "'Space Mono', monospace",
          transition: "opacity 0.15s",
        }}>FETCH CONDITIONS →</button>

        <p style={{ textAlign: "center", fontSize: 9, color: THEME.textSoft, marginTop: 10, letterSpacing: 0.8 }}>
          Open-Meteo Marine API · NOAA CO-OPS (nearest station per spot) · Cloudflare Llama 70B
        </p>
      </div>
    </div>
  );
}
export default SetupScreen;

