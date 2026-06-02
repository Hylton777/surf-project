import { createClient } from "@supabase/supabase-js";

/** Project URL only — e.g. https://xxxx.supabase.co (not /rest/v1). */
export const normalizeSupabaseUrl = raw => {
  if (!raw) return "";
  let url = String(raw).trim();
  // Common copy-paste mistake from the Data API / REST docs
  url = url.replace(/\/rest\/v1\/?$/i, "");
  return url.replace(/\/+$/, "");
};

const supabaseUrl = normalizeSupabaseUrl(import.meta.env.REACT_APP_SUPABASE_URL);
const supabaseAnonKey = String(import.meta.env.REACT_APP_SUPABASE_ANON_KEY || "").trim();

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "[supabase] Missing REACT_APP_SUPABASE_URL or REACT_APP_SUPABASE_ANON_KEY — auth will not work until .env.local is configured."
  );
} else if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl)) {
  console.warn(
    "[supabase] REACT_APP_SUPABASE_URL should be your project URL only, e.g. https://YOUR_REF.supabase.co"
  );
}

export const supabase = createClient(supabaseUrl || "", supabaseAnonKey || "");
