import { SurfDashboard as SurfDashboardApp } from "../surf_intel.jsx";
import { supabase } from "./supabaseClient.js";

export default function SurfDashboard({ user, onLogin, onLogout }) {
  return (
    <SurfDashboardApp
      user={user}
      onLogin={onLogin}
      onLogout={onLogout ?? (() => supabase.auth.signOut())}
    />
  );
}
