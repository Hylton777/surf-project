import React, { useEffect, useState } from "react";
import { useAuth } from "./hooks/useAuth.js";
import LoginPage from "./pages/LoginPage.jsx";
import SurfDashboard from "./SurfDashboard.jsx";
import { supabase } from "./supabaseClient.js";

const THEME = {
  accent: "#2bb7a7",
  textSoft: "#4f8ca3",
};

function AuthLoadingScreen() {
  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(180deg, #b9ecff 0%, #8dd9f3 50%, #f4e3bf 100%)",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: THEME.accent,
          letterSpacing: 4,
          fontFamily: "'Space Mono', monospace",
        }}
      >
        SURF INTEL
      </div>
      <div style={{ fontSize: 11, color: THEME.textSoft, marginTop: 12 }}>Loading…</div>
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);

  useEffect(() => {
    if (user) setLoginOpen(false);
  }, [user]);

  if (loading) return <AuthLoadingScreen />;

  return (
    <>
      <SurfDashboard
        user={user}
        onLogin={() => setLoginOpen(true)}
        onLogout={() => supabase.auth.signOut()}
      />
      {loginOpen && !user && (
        <LoginPage modal onDismiss={() => setLoginOpen(false)} />
      )}
    </>
  );
}
