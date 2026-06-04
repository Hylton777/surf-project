import React, { Component, useEffect, useState } from "react";
import { useAuth } from "./hooks/useAuth.js";
import LoginPage from "./pages/LoginPage.jsx";
import { SurfDashboard } from "./app/SurfDashboard.jsx";
import { supabase } from "./services/supabaseClient.js";
import { THEME } from "./theme.js";

class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            height: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            fontFamily: "'Inter', sans-serif",
            background: "linear-gradient(180deg, #b9ecff 0%, #8dd9f3 50%, #f4e3bf 100%)",
          }}
        >
          <div style={{ fontSize: 11, color: THEME.accent, letterSpacing: 4, fontFamily: "'Space Mono', monospace" }}>
            SURF INTEL
          </div>
          <p style={{ color: THEME.textStrong, marginTop: 16, fontWeight: 600 }}>Something went wrong.</p>
          <p style={{ color: THEME.textSoft, fontSize: 12, maxWidth: 420, textAlign: "center", lineHeight: 1.5 }}>
            {this.state.error?.message || "Unexpected error"}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: 16,
              padding: "10px 18px",
              border: "none",
              borderRadius: 6,
              background: THEME.accent,
              color: "#fff",
              cursor: "pointer",
              fontFamily: "'Space Mono', monospace",
              fontSize: 10,
              letterSpacing: 1,
            }}
          >
            RELOAD
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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
    <ErrorBoundary>
      <SurfDashboard
        user={user}
        onLogin={() => setLoginOpen(true)}
        onLogout={() => supabase.auth.signOut()}
      />
      {loginOpen && !user && (
        <LoginPage modal onDismiss={() => setLoginOpen(false)} />
      )}
    </ErrorBoundary>
  );
}
