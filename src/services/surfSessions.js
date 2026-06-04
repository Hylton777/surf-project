import { supabase } from "./supabaseClient.js";
import { waitForAuthSession } from "./userProfile.js";

const TABLE = "surf_sessions";
const localKey = userId => `surf_intel_surf_sessions_${userId}`;

/**
 * @typedef {object} SurfSession
 * @property {string} id
 * @property {string} spotId
 * @property {string} spotName
 * @property {string} sessionDate YYYY-MM-DD
 * @property {string} startTime HH:MM
 * @property {string} endTime HH:MM
 * @property {string} boardId
 * @property {number} stars 1-5
 * @property {object} forecastSnapshot
 * @property {string} createdAt
 */

const normalizeSession = raw => {
  if (!raw || typeof raw !== "object") return null;
  const stars = Number(raw.stars);
  if (!Number.isFinite(stars) || stars < 1 || stars > 5) return null;
  return {
    id: String(raw.id || crypto.randomUUID?.() || `local_${Date.now()}`),
    spotId: String(raw.spotId || raw.spot_id || ""),
    spotName: String(raw.spotName || raw.spot_name || ""),
    sessionDate: String(raw.sessionDate || raw.session_date || ""),
    startTime: String(raw.startTime || raw.start_time || ""),
    endTime: String(raw.endTime || raw.end_time || ""),
    boardId: String(raw.boardId || raw.board_id || ""),
    stars: Math.round(stars),
    forecastSnapshot: raw.forecastSnapshot || raw.forecast_snapshot || {},
    createdAt: raw.createdAt || raw.created_at || new Date().toISOString(),
  };
};

const rowToSession = row =>
  normalizeSession({
    id: row.id,
    spotId: row.spot_id,
    spotName: row.spot_name,
    sessionDate: row.session_date,
    startTime: row.start_time,
    endTime: row.end_time,
    boardId: row.board_id,
    stars: row.stars,
    forecastSnapshot: row.forecast_snapshot,
    createdAt: row.created_at,
  });

const sessionToRow = (userId, session) => ({
  id: session.id,
  user_id: userId,
  spot_id: session.spotId,
  spot_name: session.spotName,
  session_date: session.sessionDate,
  start_time: session.startTime,
  end_time: session.endTime,
  board_id: session.boardId,
  stars: session.stars,
  forecast_snapshot: session.forecastSnapshot || {},
  updated_at: new Date().toISOString(),
});

export function loadSurfSessionsLocal(userId) {
  if (!userId || typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(localKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeSession).filter(Boolean);
  } catch {
    return [];
  }
}

export function saveSurfSessionsLocal(userId, sessions) {
  if (!userId || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(localKey(userId), JSON.stringify(sessions));
  } catch (e) {
    console.warn("[surfSessions] local save failed:", e);
  }
}

/** @returns {Promise<SurfSession[]>} */
export async function loadSurfSessions(userId) {
  if (!userId) return [];

  const cached = loadSurfSessionsLocal(userId);

  try {
    await waitForAuthSession();
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("user_id", userId)
      .order("session_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("[surfSessions] Supabase load failed:", error.message);
      return cached;
    }

    const sessions = (data || []).map(rowToSession).filter(Boolean);
    if (sessions.length) saveSurfSessionsLocal(userId, sessions);
    return sessions.length ? sessions : cached;
  } catch (e) {
    console.warn("[surfSessions] load error:", e);
    return cached;
  }
}

/** @returns {Promise<{ ok: boolean, session?: SurfSession, error?: string }>} */
export async function saveSurfSession(userId, sessionInput) {
  if (!userId) return { ok: false, error: "not logged in" };

  const session = normalizeSession(sessionInput);
  if (!session?.spotId || !session.sessionDate) {
    return { ok: false, error: "invalid session" };
  }

  const existing = loadSurfSessionsLocal(userId);
  const next = [session, ...existing.filter(s => s.id !== session.id)];
  saveSurfSessionsLocal(userId, next);

  try {
    await waitForAuthSession();
    const { error } = await supabase.from(TABLE).upsert(sessionToRow(userId, session), { onConflict: "id" });
    if (error) {
      console.warn("[surfSessions] Supabase save failed:", error.message);
      return { ok: false, error: error.message, session, savedLocally: true };
    }
    return { ok: true, session, savedLocally: true };
  } catch (e) {
    console.warn("[surfSessions] save error:", e);
    return { ok: false, error: String(e?.message || e), session, savedLocally: true };
  }
}

/** @returns {Promise<{ ok: boolean, error?: string }>} */
export async function deleteSurfSession(userId, sessionId) {
  if (!userId || !sessionId) return { ok: false, error: "missing id" };

  const next = loadSurfSessionsLocal(userId).filter(s => s.id !== sessionId);
  saveSurfSessionsLocal(userId, next);

  try {
    await waitForAuthSession();
    const { error } = await supabase.from(TABLE).delete().eq("user_id", userId).eq("id", sessionId);
    if (error) {
      console.warn("[surfSessions] Supabase delete failed:", error.message);
      return { ok: false, error: error.message, savedLocally: true };
    }
    return { ok: true, savedLocally: true };
  } catch (e) {
    return { ok: false, error: String(e?.message || e), savedLocally: true };
  }
}
