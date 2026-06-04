import React, { useState, useEffect } from "react";
import { FONTS, POSTCARD_BG, THEME } from "../theme.js";
function LoadingScreen({ spotCount, subtitle }) {
  const [dots, setDots] = useState(".");
  useEffect(() => {
    const id = setInterval(() => setDots(d => d.length >= 3 ? "." : d + "."), 380);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={{
      minHeight: "100vh",
      backgroundImage: POSTCARD_BG,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      backgroundAttachment: "fixed",
      display: "flex",
      flexDirection: "column", alignItems: "center", justifyContent: "center",
    }}>
      <style>{FONTS}</style>
      {/* Animated wave rings */}
      <div style={{ position: "relative", width: 80, height: 80, marginBottom: 32 }}>
        {[0,1,2].map(i => (
          <div key={i} style={{
            position: "absolute", inset: 0, borderRadius: "50%",
            border: "1px solid rgba(43,183,167,0.35)",
            animation: `pulse 2s ${i * 0.6}s ease-out infinite`,
          }} />
        ))}
        <div style={{
          position: "absolute", inset: 20, borderRadius: "50%",
          background: "rgba(43,183,167,0.18)", display: "flex",
          alignItems: "center", justifyContent: "center", fontSize: 20,
        }}>🌊</div>
      </div>
      <style>{`@keyframes pulse { 0%{transform:scale(1);opacity:0.8} 100%{transform:scale(2.2);opacity:0} }`}</style>
      <div style={{ fontSize: 11, color: THEME.accent, letterSpacing: 4, fontFamily: "'Space Mono', monospace" }}>
        READING THE OCEAN{dots}
      </div>
      <div style={{ fontSize: 11, color: THEME.textSoft, marginTop: 10, fontFamily: "'Inter', sans-serif" }}>
        {subtitle || `Fetching swell, tides & wind data for ${spotCount} spots`}
      </div>
    </div>
  );
}
export default LoadingScreen;

