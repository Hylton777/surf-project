import { supabase } from "./supabaseClient.js";

const TABLE = "user_profiles";

/**
 * @typedef {object} UserProfile
 * @property {string} skill
 * @property {string[]} quiver
 * @property {string} customBoard
 * @property {string} driveOrigin
 * @property {{ lat: number, lon: number } | null} driveOriginResolved
 */

/** @returns {Promise<UserProfile | null>} */
export async function loadUserProfile(userId) {
  if (!userId) return null;
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select("skill, quiver, custom_board, drive_origin, drive_origin_lat, drive_origin_lon")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.warn("[userProfile] load failed:", error.message);
      return null;
    }
    if (!data) return null;

    return {
      skill: data.skill || "Intermediate",
      quiver: Array.isArray(data.quiver) ? data.quiver : [],
      customBoard: data.custom_board || "",
      driveOrigin: data.drive_origin || "",
      driveOriginResolved:
        Number.isFinite(data.drive_origin_lat) && Number.isFinite(data.drive_origin_lon)
          ? { lat: data.drive_origin_lat, lon: data.drive_origin_lon }
          : null,
    };
  } catch (e) {
    console.warn("[userProfile] load error:", e);
    return null;
  }
}

/**
 * @param {string} userId
 * @param {UserProfile} profile
 */
export async function saveUserProfile(userId, profile) {
  if (!userId || !profile) return { ok: false, error: "missing user or profile" };

  const row = {
    user_id: userId,
    skill: profile.skill || "Intermediate",
    quiver: profile.quiver || [],
    custom_board: profile.customBoard || "",
    drive_origin: profile.driveOrigin || "",
    drive_origin_lat: profile.driveOriginResolved?.lat ?? null,
    drive_origin_lon: profile.driveOriginResolved?.lon ?? null,
    updated_at: new Date().toISOString(),
  };

  try {
    const { error } = await supabase.from(TABLE).upsert(row, { onConflict: "user_id" });
    if (error) {
      console.warn("[userProfile] save failed:", error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    console.warn("[userProfile] save error:", e);
    return { ok: false, error: String(e?.message || e) };
  }
}
