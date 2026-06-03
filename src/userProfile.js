import { supabase } from "./supabaseClient.js";

const TABLE = "user_profiles";
const localKey = userId => `surf_intel_user_profile_${userId}`;

/**
 * @typedef {object} UserProfile
 * @property {string} skill
 * @property {string[]} quiver
 * @property {string} customBoard
 * @property {string} driveOrigin
 * @property {{ lat: number, lon: number } | null} driveOriginResolved
 */

const normalizeProfile = raw => {
  if (!raw || typeof raw !== "object") return null;
  const resolved = raw.driveOriginResolved;
  return {
    skill: raw.skill || "Intermediate",
    quiver: Array.isArray(raw.quiver) ? raw.quiver : [],
    customBoard: raw.customBoard || "",
    driveOrigin: raw.driveOrigin || "",
    driveOriginResolved:
      resolved &&
      Number.isFinite(resolved.lat) &&
      Number.isFinite(resolved.lon)
        ? { lat: resolved.lat, lon: resolved.lon }
        : null,
  };
};

const rowToProfile = data =>
  normalizeProfile({
    skill: data.skill,
    quiver: data.quiver,
    customBoard: data.custom_board,
    driveOrigin: data.drive_origin,
    driveOriginResolved:
      Number.isFinite(data.drive_origin_lat) && Number.isFinite(data.drive_origin_lon)
        ? { lat: data.drive_origin_lat, lon: data.drive_origin_lon }
        : null,
  });

/** Synchronous read from localStorage (fallback when Supabase unavailable). */
export function loadUserProfileLocal(userId) {
  if (!userId || typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(localKey(userId));
    if (!raw) return null;
    return normalizeProfile(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveUserProfileLocal(userId, profile) {
  if (!userId || !profile || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(localKey(userId), JSON.stringify(normalizeProfile(profile)));
  } catch (e) {
    console.warn("[userProfile] local save failed:", e);
  }
}

/** Ensure Supabase client has a session before RLS-protected queries. */
export async function waitForAuthSession(maxAttempts = 8) {
  for (let i = 0; i < maxAttempts; i++) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) return session;
    await new Promise(r => setTimeout(r, 100));
  }
  return null;
}

/** @returns {Promise<UserProfile | null>} */
export async function loadUserProfile(userId) {
  if (!userId) return null;

  const cached = loadUserProfileLocal(userId);

  try {
    await waitForAuthSession();
    const { data, error } = await supabase
      .from(TABLE)
      .select("skill, quiver, custom_board, drive_origin, drive_origin_lat, drive_origin_lon")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.warn("[userProfile] Supabase load failed:", error.message);
      return cached;
    }
    if (!data) return cached;

    const profile = rowToProfile(data);
    if (profile) saveUserProfileLocal(userId, profile);
    return profile;
  } catch (e) {
    console.warn("[userProfile] load error:", e);
    return cached;
  }
}

/**
 * @param {string} userId
 * @param {UserProfile} profile
 */
export async function saveUserProfile(userId, profile) {
  if (!userId || !profile) return { ok: false, error: "missing user or profile" };

  const normalized = normalizeProfile(profile);
  saveUserProfileLocal(userId, normalized);

  const row = {
    user_id: userId,
    skill: normalized.skill,
    quiver: normalized.quiver,
    custom_board: normalized.customBoard,
    drive_origin: normalized.driveOrigin,
    drive_origin_lat: normalized.driveOriginResolved?.lat ?? null,
    drive_origin_lon: normalized.driveOriginResolved?.lon ?? null,
    updated_at: new Date().toISOString(),
  };

  try {
    await waitForAuthSession();
    const { error } = await supabase.from(TABLE).upsert(row, { onConflict: "user_id" });
    if (error) {
      console.warn("[userProfile] Supabase save failed:", error.message);
      return { ok: false, error: error.message, savedLocally: true };
    }
    return { ok: true, savedLocally: true };
  } catch (e) {
    console.warn("[userProfile] save error:", e);
    return { ok: false, error: String(e?.message || e), savedLocally: true };
  }
}
