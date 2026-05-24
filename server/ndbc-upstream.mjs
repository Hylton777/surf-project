/**
 * Shared NDBC .spec fetch for Vite dev proxy, standalone proxy, and Vercel serverless.
 */
export async function fetchNdbcSpecUpstream(stationId) {
  const id = String(stationId || "").replace(/\D/g, "");
  if (!id) {
    return { ok: false, status: 400, text: "Invalid station id" };
  }

  const upstream = await fetch(`https://www.ndbc.noaa.gov/data/realtime2/${id}.spec`, {
    headers: { "user-agent": "SurfIntel/1.0" },
  });
  const text = await upstream.text();
  return { ok: upstream.ok, status: upstream.status, text };
}
