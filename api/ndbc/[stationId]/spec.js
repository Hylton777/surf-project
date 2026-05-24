/**
 * Vercel Serverless Function: same path as Vite dev proxy (`GET /api/ndbc/:stationId/spec`).
 * No environment variables required — proxies public NOAA NDBC realtime2 data.
 */
import { fetchNdbcSpecUpstream } from "../../../server/ndbc-upstream.mjs";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "text/plain");
    res.end("Method not allowed");
    return;
  }

  const stationId = req.query?.stationId;
  try {
    const result = await fetchNdbcSpecUpstream(stationId);
    res.statusCode = result.status;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.end(result.text);
  } catch (e) {
    console.error("[api/ndbc/spec] upstream fetch failed:", e);
    res.statusCode = 502;
    res.setHeader("Content-Type", "text/plain");
    res.end(e?.message || "NDBC upstream error");
  }
}
