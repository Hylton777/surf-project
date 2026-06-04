export const formatDriveDuration = totalSeconds => {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return null;
  const mins = Math.round(totalSeconds / 60);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins ? `${hours} hr ${remMins} min` : `${hours} hr`;
};

export const parseLatLonString = value => {
  const m = String(value || "").trim().match(/^(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[3]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
};

const tomTomLabel = (result, fallback = "") =>
  result?.address?.freeformAddress ||
  [result?.address?.municipality, result?.address?.countrySubdivision, result?.address?.country]
    .filter(Boolean)
    .join(", ") ||
  fallback;

export const fetchTomTomLocationOptions = async (query, apiKey, opts = {}) => {
  const parsed = parseLatLonString(query);
  if (parsed) {
    return [{
      lat: parsed.lat,
      lon: parsed.lon,
      label: `${parsed.lat.toFixed(5)},${parsed.lon.toFixed(5)}`,
    }];
  }

  const cleaned = String(query || "").trim();
  if (!cleaned) return [];

  const limit = opts.limit ?? 8;
  const params = new URLSearchParams();
  params.set("key", apiKey);
  params.set("limit", String(limit));
  if (opts.countrySet) params.set("countrySet", opts.countrySet);
  if (opts.biasLat != null && opts.biasLon != null) {
    params.set("lat", String(opts.biasLat));
    params.set("lon", String(opts.biasLon));
  }
  if (opts.radiusMeters != null) params.set("radius", String(opts.radiusMeters));

  const url = `https://api.tomtom.com/search/2/geocode/${encodeURIComponent(cleaned)}.json?${params.toString()}`;
  try {
    const res = await fetch(url);
    const json = await res.json().catch(() => ({}));
    const results = (json?.results || []).filter(r => r?.position);
    return results.map(r => ({
      lat: r.position.lat,
      lon: r.position.lon,
      label: tomTomLabel(r, cleaned),
    }));
  } catch {
    return [];
  }
};

export const resolveTomTomLocation = async (origin, apiKey, opts) => {
  const options = await fetchTomTomLocationOptions(origin, apiKey, opts || {});
  return options[0] || null;
};

export const resolveTomTomOrigin = async (origin, apiKey) => {
  const loc = await resolveTomTomLocation(origin, apiKey);
  return loc ? { lat: loc.lat, lon: loc.lon } : null;
};

export const fetchDriveTimes = async (spots, originInput) => {
  const apiKey = (import.meta.env.VITE_TOMTOM_API_KEY || "").trim();
  const origin = (originInput || import.meta.env.VITE_DRIVE_ORIGIN || "San Francisco, CA").trim();
  if (!apiKey || !origin || !spots?.length) return {};
  const originCoords = await resolveTomTomOrigin(origin, apiKey);
  if (!originCoords) return {};

  const requests = spots.map(async spot => {
    const routePath = `${originCoords.lat},${originCoords.lon}:${spot.lat},${spot.lon}`;
    const url = `https://api.tomtom.com/routing/1/calculateRoute/${routePath}/json?key=${encodeURIComponent(apiKey)}&travelMode=car&traffic=true&departAt=now`;
    try {
      const res = await fetch(url);
      const json = await res.json().catch(() => ({}));
      const summary = json?.routes?.[0]?.summary;
      if (!summary) return [spot.id, null];
      const totalSeconds = summary.travelTimeInSeconds || 0;
      return [spot.id, formatDriveDuration(totalSeconds)];
    } catch {
      return [spot.id, null];
    }
  });

  const entries = await Promise.all(requests);
  return Object.fromEntries(entries);
};

export const fetchMissingDriveTimes = async (spots, existingDriveTimes = {}, originInput) => {
  const missing = spots.filter(s => !existingDriveTimes[s.id]);
  if (!missing.length) return {};
  return fetchDriveTimes(missing, originInput);
};
