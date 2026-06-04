import React, { useState } from "react";
import { FONTS, POSTCARD_BG, THEME } from "../theme.js";
import { BOARDS } from "../data/defaultSpots.js";
import { fmtSurfFt, degToCompass } from "../lib/format.js";
import { getRatingDisplayColor } from "../lib/ratings.js";
import { computeDisplayScore, rankSpots } from "../forecast/spotRanking.js";
import { formatForecastCenterLabel } from "../services/openMeteo.js";
import ForecastDateNav from "../components/ForecastDateNav.jsx";
import WaveForecastChart from "../components/charts/WaveForecastChart.jsx";
import TideChart from "../components/charts/TideChart.jsx";
import WindCompass from "../components/WindCompass.jsx";
import LogSessionModal from "../components/sessions/LogSessionModal.jsx";
import MySessionsPanel from "../components/sessions/MySessionsPanel.jsx";
function Dashboard({
  user,
  onLogin,
  onLogout,
  onChangePreferences,
  spots,
  spotData,
  driveTimes,
  activeSpot,
  setActiveSpot,
  tidesByStation,
  aiRec,
  aiCalled,
  skill,
  quiver,
  onGenerateAi,
  addSpotOpen,
  setAddSpotOpen,
  addSpotName,
  setAddSpotName,
  addSpotStatus,
  addSpotLoading,
  onAddSpot,
  surfSessions,
  logSessionOpen,
  setLogSessionOpen,
  mySessionsOpen,
  setMySessionsOpen,
  onSaveSession,
  onDeleteSession,
  getSpotScoringConfig,
  forecastDate,
  onForecastDateChange,
}) {
  const [syncMs, setSyncMs] = useState(null);
  const data = activeSpot ? spotData[activeSpot.id] : null;
  const spotTides = activeSpot ? tidesByStation[activeSpot.tideStationId] || [] : [];
  const activeSpotScore = activeSpot ? computeDisplayScore(activeSpot, data, tidesByStation) : null;
  const sortedSpots = rankSpots(spots, spotData, tidesByStation, driveTimes, surfSessions);

  const boardNameForId = id => BOARDS.find(b => b.id === id)?.name || id;

  const formatAI = text =>
    text.replace(/\*\*(.*?)\*\*/g, `<strong style="color:${THEME.accent}">$1</strong>`)
        .replace(/\n\n/g, "</p><p style='margin:8px 0'>")
        .replace(/\n/g, "<br/>");

  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

  if (!activeSpot) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: THEME.textSoft }}>
        No spots loaded.
      </div>
    );
  }

  return (
    <div style={{
      height: "100vh",
      backgroundImage: POSTCARD_BG,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      backgroundAttachment: "fixed",
      color: THEME.text,
      fontFamily: "'Inter', sans-serif",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>
      <style>{FONTS}</style>

      {/* ── Top bar: logo · date · preferences · auth ── */}
      <div style={{
        padding: "0 20px",
        height: 52,
        display: "flex",
        alignItems: "center",
        gap: 16,
        borderBottom: `1px solid ${THEME.border}`,
        flexShrink: 0,
        background: "rgba(255,255,255,0.72)",
        backdropFilter: "blur(4px)",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexShrink: 0 }}>
          <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, color: THEME.textStrong }}>SURF INTEL</span>
          <span style={{ fontSize: 9, letterSpacing: 3, color: THEME.textSoft }}>BAY AREA</span>
        </div>

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
            minWidth: 0,
          }}
        >
          <span style={{ fontSize: 10, color: THEME.text, fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>
            {dateStr} · {timeStr}
          </span>
          <span style={{ fontSize: 10, color: THEME.textSoft }}>
            {skill} · {quiver.length} board{quiver.length === 1 ? "" : "s"}
            {!user && (
              <span style={{ color: THEME.muted }}> · not saved until you log in</span>
            )}
          </span>
        </div>

        <button
          type="button"
          onClick={onChangePreferences}
          title={user ? "Update skill, quiver, and start location" : "Update preferences for this session only"}
          style={{
            flexShrink: 0,
            padding: "7px 12px",
            fontSize: 9,
            letterSpacing: 1,
            fontFamily: "'Space Mono', monospace",
            color: THEME.accent,
            background: THEME.accentSoft,
            border: `1px solid ${THEME.border}`,
            borderRadius: 6,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Change preferences
        </button>

        {user && (
          <button
            type="button"
            onClick={() => setMySessionsOpen(true)}
            style={{
              flexShrink: 0,
              padding: "7px 12px",
              fontSize: 9,
              letterSpacing: 1,
              fontFamily: "'Space Mono', monospace",
              color: THEME.textSoft,
              background: THEME.panel,
              border: `1px solid ${THEME.border}`,
              borderRadius: 6,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            My sessions{surfSessions?.length ? ` (${surfSessions.length})` : ""}
          </button>
        )}

        {user ? (
          <button
            type="button"
            onClick={onLogout}
            style={{
              flexShrink: 0,
              padding: "7px 14px",
              fontSize: 9,
              letterSpacing: 2,
              fontFamily: "'Space Mono', monospace",
              fontWeight: 700,
              color: THEME.textSoft,
              background: THEME.panel,
              border: `1px solid ${THEME.border}`,
              borderRadius: 6,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
            title={user.email || "Log out"}
          >
            LOG OUT
          </button>
        ) : (
          <button
            type="button"
            onClick={onLogin}
            title="Log in to save your preferences for personalized surf recommendations"
            style={{
              flexShrink: 0,
              padding: "7px 14px",
              fontSize: 9,
              letterSpacing: 2,
              fontFamily: "'Space Mono', monospace",
              fontWeight: 700,
              color: "#fff",
              background: THEME.accent,
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            LOG IN
          </button>
        )}
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* ── Spot sidebar ── */}
        <div style={{
          width: 188,
          borderRight: `1px solid ${THEME.border}`,
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          background: "rgba(255,255,255,0.6)",
          backdropFilter: "blur(3px)",
        }}>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {sortedSpots.map(spot => {
              const d = spotData[spot.id];
              const scoreResult = computeDisplayScore(spot, d, tidesByStation);
              const drive = driveTimes[spot.id];
              const active = spot.id === activeSpot.id;
              return (
                <div key={spot.id} onClick={() => setActiveSpot(spot)} style={{
                  padding: "13px 16px", cursor: "pointer",
                  borderBottom: `1px solid ${THEME.border}`,
                  borderLeft: active ? `2px solid ${THEME.accent}` : "2px solid transparent",
                  background: active ? THEME.accentSoft : "transparent",
                  transition: "all 0.1s",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: active ? THEME.textStrong : THEME.textSoft }}>{spot.shortName}</div>
                  </div>
                  {scoreResult && (
                    <div style={{ fontSize: 10, color: getRatingDisplayColor(scoreResult.rating), fontFamily: "'Space Mono', monospace", fontWeight: 700, marginBottom: 4 }}>
                      {scoreResult.score}/100 · {scoreResult.rating}
                    </div>
                  )}
                  <div style={{ fontSize: 9, color: THEME.muted, marginBottom: 5 }}>{spot.type} · {spot.city}</div>
                  {d ? (
                    <>
                      <div style={{ fontSize: 11, color: THEME.text, fontFamily: "'Space Mono', monospace" }}>
                        {fmtSurfFt(d.surfHeightFt)}ft @ {d.swellPeriod?.toFixed(0)}s
                      </div>
                      <div style={{ fontSize: 10, color: THEME.textSoft, fontFamily: "'Space Mono', monospace", marginTop: 4 }}>
                        {drive ? `${drive} drive` : "Drive time —"}
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: 10, color: "#1a2a3a" }}>—</div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ borderTop: `1px solid ${THEME.border}`, padding: 10 }}>
            {addSpotOpen ? (
              <div>
                <input
                  value={addSpotName}
                  onChange={e => setAddSpotName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") onAddSpot();
                  }}
                  placeholder="Surf spot (ZIP via Claude, then map)"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "7px 8px",
                    borderRadius: 6,
                    border: `1px solid ${THEME.border}`,
                    fontSize: 10,
                    color: THEME.text,
                    fontFamily: "'Space Mono', monospace",
                    marginBottom: 6,
                    background: THEME.panel,
                  }}
                />
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={onAddSpot}
                    disabled={addSpotLoading}
                    style={{
                      flex: 1,
                      padding: "7px 0",
                      borderRadius: 6,
                      border: "none",
                      background: THEME.accent,
                      color: "#fff",
                      fontSize: 9,
                      letterSpacing: 1,
                      cursor: addSpotLoading ? "default" : "pointer",
                      fontFamily: "'Space Mono', monospace",
                      opacity: addSpotLoading ? 0.75 : 1,
                    }}
                  >
                    {addSpotLoading ? "ADDING..." : "ADD"}
                  </button>
                  <button
                    onClick={() => {
                      setAddSpotOpen(false);
                      setAddSpotName("");
                    }}
                    disabled={addSpotLoading}
                    style={{
                      flex: 1,
                      padding: "7px 0",
                      borderRadius: 6,
                      border: `1px solid ${THEME.border}`,
                      background: THEME.panel,
                      color: THEME.textSoft,
                      fontSize: 9,
                      letterSpacing: 1,
                      cursor: addSpotLoading ? "default" : "pointer",
                      fontFamily: "'Space Mono', monospace",
                    }}
                  >
                    CANCEL
                  </button>
                </div>
                {addSpotStatus && (
                  <div style={{ fontSize: 9, color: THEME.textSoft, marginTop: 6, lineHeight: 1.35 }}>
                    {addSpotStatus}
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => setAddSpotOpen(true)}
                style={{
                  width: "100%",
                  padding: "8px 0",
                  borderRadius: 6,
                  border: `1px dashed ${THEME.accent}`,
                  background: THEME.accentSoft,
                  color: THEME.accent,
                  fontSize: 9,
                  letterSpacing: 1.2,
                  cursor: "pointer",
                  fontFamily: "'Space Mono', monospace",
                }}
              >
                + ADD SPOT
              </button>
            )}
          </div>
        </div>

        {/* ── Main panel ── */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          padding: 24,
          background: "rgba(249,253,255,0.42)",
          backdropFilter: "blur(2px)",
        }}>
          {data ? (
            <>
              {/* Spot header */}
              <div style={{ marginBottom: 22 }}>
                <div style={{ fontSize: 9, letterSpacing: 3, color: THEME.textSoft, marginBottom: 6 }}>
                  {activeSpot.city.toUpperCase()} · {activeSpot.type.toUpperCase()} · {activeSpot.difficulty.toUpperCase()}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                  <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, margin: 0, color: THEME.textStrong }}>
                    {activeSpot.name}
                  </h2>
                  {activeSpotScore && (
                    <div style={{
                      fontSize: 10,
                      color: getRatingDisplayColor(activeSpotScore.rating),
                      fontFamily: "'Space Mono', monospace",
                      fontWeight: 700,
                      letterSpacing: 1.5,
                      border: `1px solid ${getRatingDisplayColor(activeSpotScore.rating)}30`,
                      padding: "4px 10px",
                      borderRadius: 3,
                      background: `${getRatingDisplayColor(activeSpotScore.rating)}12`,
                    }}>
                      SCORE {activeSpotScore.score}/100 · {(activeSpotScore.rating || "—").toUpperCase()}
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: THEME.textSoft, fontFamily: "'Space Mono', monospace", letterSpacing: 1.5 }}>
                    {driveTimes[activeSpot.id] ? `${driveTimes[activeSpot.id]} DRIVE` : "DRIVE TIME —"}
                  </div>
                </div>
                <ForecastDateNav
                  date={forecastDate}
                  onChange={onForecastDateChange}
                />
              </div>

              {/* Stat cards */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
                {[
                  {
                    label: "SURF HEIGHT",
                    value: `${fmtSurfFt(data.surfHeightFt)}ft`,
                    sub: [
                      data.swellPeriod ? `${data.swellPeriod.toFixed(0)}s period` : "",
                      data.isForecastToday !== false && (data.forecastSource === "blend" || data.forecastSource === "buoy")
                        ? `NDBC blend (now) · ${data.ndbcStationId}`
                        : data.isForecastToday === false
                          ? `${formatForecastCenterLabel(forecastDate)} · midday estimate`
                          : "",
                    ].filter(Boolean).join(" · "),
                  },
                  { label: "SWELL DIR", value: degToCompass(data.swellDir), sub: `${Math.round(data.swellDir || 0)}° bearing` },
                  {
                    label: "WIND",
                    valueElement: (
                      <span style={{ position: "relative", display: "inline-block", width: "100%" }}>
                        <span>{`${data.windSpeed?.toFixed(0)}mph`}</span>
                        <svg
                          width="46"
                          height="46"
                          viewBox="0 0 24 24"
                          style={{ position: "absolute", right: 8, top: "50%", transform: `translateY(-50%) rotate(${(data.windDir || 0) + 180}deg)`, flexShrink: 0 }}
                        >
                          <path
                            d="M12 3 L12 21 M5 10 L12 3 L19 10"
                            stroke={THEME.accent}
                            strokeWidth="2.5"
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                    ),
                    sub: `from ${degToCompass(data.windDir)}`,
                  },
                ].map(c => (
                  <div key={c.label} style={{ background: THEME.panel, borderRadius: 8, padding: "13px 14px", border: `1px solid ${THEME.border}` }}>
                    <div style={{ fontSize: 8, letterSpacing: 3, color: THEME.muted, marginBottom: 8 }}>{c.label}</div>
                    <div style={{ fontSize: 20, fontFamily: "'Space Mono', monospace", color: THEME.accent, fontWeight: 700, lineHeight: 1 }}>{c.valueElement || c.value}</div>
                    <div style={{ fontSize: 10, color: THEME.textSoft, marginTop: 5 }}>{c.subElement || c.sub}</div>
                  </div>
                ))}
              </div>

              {/* 24-hr wave forecast (full width) */}
              <div style={{ background: THEME.panel, borderRadius: 8, padding: "13px 16px", border: `1px solid ${THEME.border}`, marginBottom: 16 }}>
                <div style={{ fontSize: 8, letterSpacing: 3, color: THEME.muted, marginBottom: 6 }}>
                  24-HR SURF FORECAST — {formatForecastCenterLabel(forecastDate).toUpperCase()}
                </div>
                <div style={{ fontSize: 10, color: THEME.textSoft, marginBottom: 12 }}>
                  {data.isForecastToday !== false
                    ? "Hourly model + wind; now uses NDBC when available"
                    : "Hourly model forecast for selected day"}
                </div>
                <WaveForecastChart
                  points={data.dayForecastPoints}
                  times={data.dayTimes}
                  heights={data.daySurfHeights ?? data.dayWaveHeights}
                  dateStr={forecastDate}
                  syncMs={syncMs}
                  onSyncHover={setSyncMs}
                />
              </div>

              {/* Tides */}
              <div style={{ background: THEME.panel, borderRadius: 8, padding: "13px 16px", border: `1px solid ${THEME.border}`, marginBottom: user ? 12 : 0 }}>
                <div style={{ fontSize: 8, letterSpacing: 3, color: THEME.muted, marginBottom: 14 }}>
                  TIDES — NOAA {activeSpot.tideStationId} · {activeSpot.tideStationLabel}
                </div>
                <TideChart tides={spotTides} dateStr={forecastDate} syncMs={syncMs} onSyncHover={setSyncMs} />
              </div>

              {user && (
                <button
                  type="button"
                  onClick={() => setLogSessionOpen(true)}
                  style={{
                    width: "100%",
                    marginTop: 4,
                    padding: "11px 0",
                    borderRadius: 8,
                    border: `1px dashed ${THEME.accent}`,
                    background: THEME.accentSoft,
                    color: THEME.accent,
                    fontSize: 10,
                    letterSpacing: 1.5,
                    cursor: "pointer",
                    fontFamily: "'Space Mono', monospace",
                    fontWeight: 700,
                  }}
                >
                  I SURFED HERE TODAY
                </button>
              )}
            </>
          ) : (
            <div style={{ padding: 40, textAlign: "center", color: THEME.textSoft, fontSize: 13 }}>
              No data for this spot — check your connection.
            </div>
          )}
        </div>

        {/* ── AI Panel ── */}
        <div style={{
          width: 292, borderLeft: `1px solid ${THEME.border}`, padding: "20px 18px",
          overflowY: "auto", flexShrink: 0, background: THEME.panelAlt,
        }}>
          <div style={{ fontSize: 8, letterSpacing: 4, color: THEME.accent, marginBottom: 16 }}>AI RECOMMENDATION</div>

          {aiRec.loading ? (
            <div>
              <div style={{ fontSize: 11, color: THEME.textSoft, marginBottom: 6 }}>Showing AI recommendation…</div>
              {aiRec.retryAttempt > 1 && (
                <div style={{ fontSize: 10, color: THEME.muted, marginBottom: 12, fontFamily: "'Space Mono', monospace" }}>
                  Retrying AI recommendation ({aiRec.retryAttempt}/{aiRec.maxAttempts})…
                </div>
              )}
              {[100, 80, 90, 70, 85].map((w, i) => (
                <div key={i} style={{
                  height: 10, background: "#d5edf4", borderRadius: 3, marginBottom: 8,
                  width: `${w}%`, animation: "shimmer 1.5s infinite",
                }} />
              ))}
              <style>{`@keyframes shimmer{0%,100%{opacity:0.4}50%{opacity:1}}`}</style>
            </div>
          ) : aiCalled ? (
            aiRec.text ? (
              <div
                style={{ fontSize: 12.5, lineHeight: 1.75, color: THEME.text }}
                dangerouslySetInnerHTML={{ __html: `<p style='margin:0'>${formatAI(aiRec.text)}</p>` }}
              />
            ) : (
              <div style={{ fontSize: 12, color: THEME.textSoft }}>
                AI recommendation unavailable.
              </div>
            )
          ) : (
            <div>
              <div style={{ fontSize: 12, color: THEME.textSoft, marginBottom: 14, lineHeight: 1.55 }}>
                Coach write-up for {formatForecastCenterLabel(forecastDate).toLowerCase()} using scores and hourly forecasts for all spots. One call per day selection.
              </div>
              <button
                onClick={onGenerateAi}
                style={{
                  width: "100%",
                  padding: "11px 0",
                  background: THEME.accent,
                  border: "none",
                  borderRadius: 6,
                  color: "#ffffff",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 2,
                  cursor: "pointer",
                  fontFamily: "'Space Mono', monospace",
                }}
              >
                GENERATE RECOMMENDATION
              </button>
            </div>
          )}

          {/* Divider + legend */}
          <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${THEME.border}` }}>
            <div style={{ fontSize: 8, letterSpacing: 3, color: THEME.textSoft, marginBottom: 12 }}>CONDITION KEY</div>
            {[
              { label: "Pumping", color: getRatingDisplayColor("Pumping"), desc: "6 ft+ face, high-quality surf" },
              { label: "Good", color: getRatingDisplayColor("Good"), desc: "4 ft+ face, consistently quality waves" },
              { label: "Smooth", color: getRatingDisplayColor("Smooth"), desc: "Clean conditions, smaller surf (under 4 ft face)" },
              { label: "Decent", color: getRatingDisplayColor("Decent"), desc: "Rideable with some tradeoffs" },
              { label: "Bad", color: getRatingDisplayColor("Bad"), desc: "Marginal and inconsistent" },
              { label: "Poor", color: getRatingDisplayColor("Poor"), desc: "Unfavorable surf conditions" },
            ].map(r => (
              <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                <span style={{ fontSize: 8, color: r.color, fontFamily: "'Space Mono', monospace", fontWeight: 700, minWidth: 46 }}>{r.label}</span>
                <span style={{ fontSize: 10, color: THEME.textSoft }}>{r.desc}</span>
              </div>
            ))}
          </div>

          {/* Data credits */}
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${THEME.border}` }}>
            <div style={{ fontSize: 8, letterSpacing: 3, color: THEME.muted, marginBottom: 8 }}>DATA SOURCES</div>
            {[
              "Open-Meteo Marine API",
              "Open-Meteo Forecast API",
              "NOAA CO-OPS Tides",
              "TomTom Routing API",
              "Cloudflare Llama 70B",
            ].map(s => (
              <div key={s} style={{ fontSize: 9, color: THEME.muted, marginBottom: 4 }}>· {s}</div>
            ))}
            <div style={{ fontSize: 9, color: THEME.textSoft, marginTop: 12, lineHeight: 1.55 }}>
              Surf height is estimated from offshore swell, period, break type, and direction
              {` `}(face height). When available, conditions are blended with nearby <strong style={{ color: THEME.text }}>NDBC buoy</strong> readings.
              Heights are offshore-style estimates and often differ from a given break after shoaling and local wind.
              Tide highs/lows are NOAA CO-OPS predictions for the station shown for the selected spot; each break uses the nearest applicable prediction station.
            </div>
          </div>
        </div>
      </div>

      {logSessionOpen && user && (
        <LogSessionModal
          spot={activeSpot}
          quiver={quiver}
          spotData={spotData}
          getSpotScoringConfig={getSpotScoringConfig}
          onClose={() => setLogSessionOpen(false)}
          onSave={onSaveSession}
        />
      )}

      {mySessionsOpen && user && (
        <MySessionsPanel
          sessions={surfSessions}
          onClose={() => setMySessionsOpen(false)}
          onDelete={onDeleteSession}
          boardNameForId={boardNameForId}
        />
      )}
    </div>
  );
}
export default Dashboard;

