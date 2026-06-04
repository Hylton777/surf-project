import { getAiSpotConfigModel, getAnthropicMessagesUrl } from "../lib/aiClient.js";
import { parseJsonObjectFromText } from "../lib/json.js";
import { normalizeGeneratedSpotConfig } from "../forecast/userSpotConfig.js";

const fetchSurfSpotConfigFromAnthropic = async (spotName, regionHint) => {
  const anthropicUrl = getAnthropicMessagesUrl();
  const model = getAiSpotConfigModel();
  const res = await fetch(anthropicUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 1400,
      system: `You are a surf forecasting expert with deep knowledge of surf breaks worldwide. When given the name of a surf break, you return a precise JSON configuration object for that break. You must respond with valid JSON only - no explanation, no markdown, no backticks. If you are uncertain about a value, make the most accurate estimate you can based on the break's known geography, coastline orientation, and surf characteristics. Never refuse - always return a best-effort JSON object.`,
      messages: [{
        role: "user",
        content: `Return a JSON object for the surf break: "${spotName}"

Regional context for disambiguation: ${regionHint || "Use the spot name and well-known geography to locate the break precisely"}

The object must have exactly these fields:

{
  "id": string (slugified name, e.g. "the_hook"),
  "name": string (proper display name),
  "region": string (city or region name),
  "latitude": number,
  "longitude": number,
  "break_type": "beach" | "reef" | "point" | "reef_point",
  "difficulty": "beginner" | "intermediate" | "advanced" | "expert",
  "break_facing_direction": number (degrees 0–360, direction break faces toward ocean),
  "optimal_swell_directions": number[] (1–3 swell directions in degrees that work best),
  "swell_direction_tolerance": number (degrees, typically 15–45),
  "min_rideable_ft": number,
  "optimal_height_min_ft": number,
  "optimal_height_max_ft": number,
  "max_rideable_ft": number,
  "min_period_s": number,
  "optimal_tide_range_ft": [number, number] (MLLW feet, e.g. [1.0, 3.5]),
  "tide_preference": "low" | "mid" | "high" | "any",
  "noaa_tide_station_id": string (ID of nearest NOAA tide station),
  "ndbc_station_id": string | null (nearest NDBC buoy, e.g. "46214" Half Moon Bay, "46042" Monterey, "46013" Bodega Bay),
  "face_multiplier": number | null (optional Hs→face override for unusual breaks),
  "surf_height_scale": number (0.4–0.7 typical; calibrates displayed face height to local break — beach ~0.54, reef_point ~0.62, reef ~0.48),
  "surf_period_scale": number (0.9–1.0 typical; calibrates displayed swell period — beach ~0.93, reef_point ~0.96),
  "weights": {
    "height": number,
    "period": number,
    "direction": number,
    "wind": number,
    "tide": number
  },
  "notes": string (2–3 sentences on what makes this break unique),
  "isUserAdded": true,
  "confidence": "high" | "medium" | "low"
}

For weights: all 5 values must sum to exactly 1.0. Keep height around 0.20 (users see wave size separately in the UI); weight period, direction, wind, and tide more heavily. Reef/point breaks should weight direction and period higher; tide-sensitive breaks should weight tide higher; big wave spots should weight period highest.

For noaa_tide_station_id: return the nearest NOAA CO-OPS station.
Common references:
- San Francisco area: 9414290
- Point Reyes: 9415020
- Santa Cruz: 9413745
- Monterey: 9413450
- San Diego: 9410170
- Los Angeles / Santa Monica: 9410660
- Morro Bay: 9412110
- Crescent City: 9419750
- Newport Oregon: 9435380
- Honolulu / North Shore Oahu: 1612340
- Hanalei / Kauai: 1611683
- Nawiliwili / Kauai: 1611400
- If outside the US, set noaa_tide_station_id to null.

For ndbc_station_id: return nearest NDBC buoy ID when one exists near the break.
Common references:
- US West Coast: 46214 (Half Moon Bay), 46042 (Monterey), 46013 (Bodega Bay), 46026 (San Francisco)
- Hawaii: 51205 (Waimea Bay), 51001 (Northwest Hawaii), 51002 (Southwest Hawaii)
If no buoy is reasonably nearby or outside the US, set ndbc_station_id to null. Never assign a buoy from a different region/ocean basin.

Use the exact latitude/longitude of the named break. For famous breaks (e.g. Pipeline on North Shore Oahu), prioritize the break's known geography over the user's home region.
For optimal_swell_directions and break_facing_direction: these must match the real break orientation and the swell directions that produce surf at this specific break.

For surf_height_scale: use break-type defaults unless you know the spot well — beach 0.54, reef_point 0.62, reef 0.48, point 0.62.

For confidence: "high" if strongly known, "medium" if regional estimate, "low" if ambiguous/obscure.

Return JSON only.`,
      }],
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error?.message || json.message || `HTTP ${res.status}`);
  }
  const text = json.content?.find(b => b.type === "text")?.text || "";
  const parsed = parseJsonObjectFromText(text);
  return normalizeGeneratedSpotConfig(parsed, spotName);
};
export { fetchSurfSpotConfigFromAnthropic };

