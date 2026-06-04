import { createClient } from "@supabase/supabase-js";

/** Project URL only — e.g. https://xxxx.supabase.co (not /rest/v1). */
export const normalizeSupabaseUrl = raw => {
  if (!raw) return "";
  let url = String(raw).trim();
  url = url.replace(/\/rest\/v1\/?$/i, "");
  return url.replace(/\/+$/, "");
};

const supabaseUrl = normalizeSupabaseUrl(
  import.meta.env.REACT_APP_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL
);
const supabaseAnonKey = String(
  import.meta.env.REACT_APP_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || ""
).trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Supabase SDK throws if URL/key are empty — use placeholders so the app still boots locally.
const PLACEHOLDER_URL = "https://placeholder.supabase.co";
const PLACEHOLDER_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDUxOTI4MDAsImV4cCI6MTk2MDc2ODgwMH0.placeholder";

if (!isSupabaseConfigured) {
  console.warn(
    "[supabase] Missing REACT_APP_SUPABASE_URL / REACT_APP_SUPABASE_ANON_KEY — running without auth. Copy .env.example to .env.local and add your project credentials."
  );
} else if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl)) {
  console.warn(
    "[supabase] REACT_APP_SUPABASE_URL should be your project URL only, e.g. https://YOUR_REF.supabase.co"
  );
}

export const supabase = createClient(
  supabaseUrl || PLACEHOLDER_URL,
  supabaseAnonKey || PLACEHOLDER_ANON_KEY
);
