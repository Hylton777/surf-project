import React, { useState } from "react";
import { supabase } from "../supabaseClient.js";

const THEME = {
  bg: "#dff4ff",
  panel: "#ffffff",
  border: "#bfe4ee",
  text: "#0f4f66",
  textStrong: "#0a3f52",
  textSoft: "#4f8ca3",
  muted: "#79aebf",
  accent: "#2bb7a7",
  accentSoft: "rgba(43,183,167,0.16)",
  error: "#dc2626",
};

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Space+Mono:wght@400;700&family=Inter:wght@300;400;500;600&display=swap');`;

const POSTCARD_BG = `
  linear-gradient(180deg, rgba(232,247,255,0.72) 0%, rgba(222,242,248,0.76) 42%, rgba(247,237,214,0.8) 100%),
  linear-gradient(180deg, #b9ecff 0%, #8dd9f3 30%, #75d1cd 52%, #f4e3bf 53%, #efd6a8 100%)
`;

export default function LoginPage({ modal = false, onDismiss }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [checkEmail, setCheckEmail] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async e => {
    e.preventDefault();
    setError("");
    setCheckEmail(false);
    setSubmitting(true);

    try {
      if (mode === "login") {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) setError(signInError.message);
      } else {
        const { error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) {
          setError(signUpError.message);
        } else {
          setCheckEmail(true);
        }
      }
    } catch (err) {
      setError(err?.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const shellStyle = modal
    ? {
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(15, 79, 102, 0.45)",
        fontFamily: "'Inter', sans-serif",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }
    : {
        minHeight: "100vh",
        backgroundImage: POSTCARD_BG,
        backgroundSize: "cover",
        backgroundPosition: "center",
        fontFamily: "'Inter', sans-serif",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      };

  return (
    <div
      style={shellStyle}
      onClick={modal && onDismiss ? onDismiss : undefined}
      role={modal ? "dialog" : undefined}
      aria-modal={modal || undefined}
    >
      <style>{FONTS}</style>
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 400,
          background: THEME.panel,
          borderRadius: 10,
          border: `1px solid ${THEME.border}`,
          padding: "32px 28px",
          boxShadow: "0 8px 32px rgba(15,79,102,0.08)",
        }}
        onClick={modal ? e => e.stopPropagation() : undefined}
      >
        {modal && onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Close"
            style={{
              position: "absolute",
              top: 10,
              right: 12,
              border: "none",
              background: "none",
              color: THEME.muted,
              fontSize: 20,
              lineHeight: 1,
              cursor: "pointer",
              padding: 4,
            }}
          >
            ×
          </button>
        )}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ letterSpacing: 8, fontSize: 9, color: THEME.accent, marginBottom: 8 }}>BAY AREA</div>
          <h1
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: 32,
              color: THEME.textStrong,
              margin: 0,
              fontWeight: 700,
            }}
          >
            SURF INTEL
          </h1>
          <p style={{ color: THEME.textSoft, fontSize: 12, marginTop: 8 }}>
            {mode === "login" ? "Log in to your account" : "Create an account"}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <label style={{ display: "block", marginBottom: 14 }}>
            <span style={{ fontSize: 8, letterSpacing: 3, color: THEME.muted }}>EMAIL</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{
                display: "block",
                width: "100%",
                marginTop: 6,
                padding: "10px 12px",
                borderRadius: 6,
                border: `1px solid ${THEME.border}`,
                fontSize: 13,
                color: THEME.text,
                boxSizing: "border-box",
              }}
            />
          </label>

          <label style={{ display: "block", marginBottom: 20 }}>
            <span style={{ fontSize: 8, letterSpacing: 3, color: THEME.muted }}>PASSWORD</span>
            <input
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              minLength={6}
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{
                display: "block",
                width: "100%",
                marginTop: 6,
                padding: "10px 12px",
                borderRadius: 6,
                border: `1px solid ${THEME.border}`,
                fontSize: 13,
                color: THEME.text,
                boxSizing: "border-box",
              }}
            />
          </label>

          {error && (
            <p
              style={{
                color: THEME.error,
                fontSize: 12,
                marginBottom: 14,
                fontFamily: "'Space Mono', monospace",
              }}
            >
              {error}
            </p>
          )}

          {checkEmail && (
            <p
              style={{
                color: THEME.accent,
                fontSize: 12,
                marginBottom: 14,
                lineHeight: 1.5,
              }}
            >
              Check your email to confirm your account, then log in.
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: "100%",
              padding: "12px 0",
              border: "none",
              borderRadius: 6,
              background: THEME.accent,
              color: "#fff",
              fontSize: 12,
              letterSpacing: 2,
              fontFamily: "'Space Mono', monospace",
              fontWeight: 700,
              cursor: submitting ? "wait" : "pointer",
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? "PLEASE WAIT…" : mode === "login" ? "LOG IN" : "SIGN UP"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(m => (m === "login" ? "signup" : "login"));
            setError("");
            setCheckEmail(false);
          }}
          style={{
            width: "100%",
            marginTop: 16,
            padding: 0,
            border: "none",
            background: "none",
            color: THEME.textSoft,
            fontSize: 11,
            cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          {mode === "login" ? "Need an account? Sign up" : "Already have an account? Log in"}
        </button>
      </div>
    </div>
  );
}
