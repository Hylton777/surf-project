/**
 * SURF SPOT CONFIGURATIONS — BAY AREA
 *
 * Used to score surf conditions at each spot on a 0–100 scale.
 * Feed hourly forecast data (swell height, period, direction, wind speed,
 * wind direction, tide) into your scoring engine alongside these configs.
 *
 * ─── UNITS ───────────────────────────────────────────────────────────────────
 * Heights         → feet (face height)
 * Directions      → degrees true north (0° = N, 90° = E, 180° = S, 270° = W)
 * Wind speed      → knots
 * Tide            → feet MLLW (Mean Lower Low Water)
 * Period          → seconds
 *
 * ─── KEY CONCEPTS ────────────────────────────────────────────────────────────
 *
 * break_facing_direction
 *   The compass direction the break faces toward the open ocean.
 *   This is the direction from which waves arrive.
 *   e.g. 270 = west-facing break, waves arrive from the west.
 *   Used to compute offshore vs. onshore wind:
 *     wind_angle = wind_direction - break_facing_direction
 *     wind_angle ≈ 180° → offshore (best)
 *     wind_angle ≈ 0°   → onshore  (worst)
 *
 * optimal_swell_directions
 *   One or more swell directions (in degrees) at which this break works best.
 *   Score the incoming swell against each, take the highest score.
 *   Swell directions outside these windows score poorly or zero.
 *
 * swell_direction_tolerance
 *   How many degrees of deviation from optimal before quality degrades.
 *   Tight tolerance (15°) = very direction-sensitive break (e.g. reef point).
 *   Wide tolerance (45°) = works across a broad swell window (e.g. beachbreak).
 *
 * height thresholds
 *   min_rideable_ft    → below this, score = 0 regardless of other factors
 *   optimal_height_min → lower bound of the ideal size window
 *   optimal_height_max → upper bound of the ideal size window
 *   max_rideable_ft    → above this, the break closes out or becomes dangerous
 *
 * optimal_tide_range_ft
 *   [min, max] tide window in feet MLLW where the break performs best.
 *   Outside this window, scores are penalized proportionally.
 *
 * min_period_s
 *   Minimum swell period required for this break to work properly.
 *   Below this threshold, period component scores degrade and a graduated
 *   deficit multiplier is applied to the final weighted score.
 *
 * ─── SCORING CAPS / HARD OVERRIDES ──────────────────────────────────────────
 * Apply these after computing the weighted score:
 *   - swell_height < min_rideable_ft          → "Very Poor" regardless
 *   - swell_period < min_period_s             → graduated score multiplier (not a hard cap)
 *   - swell_direction_score === 0             → cap at "Poor"
 *   - wind_speed > 30 kts AND onshore         → cap at "Poor"
 *   - swell_height > max_rideable_ft          → cap at "Poor" (closed out)
 */

// ─────────────────────────────────────────────────────────────────────────────
// TYPE REFERENCE (for Cursor/TypeScript users)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @typedef {Object} SpotConfig
 * @property {string}   id
 * @property {string}   name
 * @property {string}   region
 * @property {number}   latitude
 * @property {number}   longitude
 * @property {string}   break_type          - "beach" | "reef" | "point" | "reef_point"
 * @property {string}   difficulty          - "beginner" | "intermediate" | "advanced" | "expert"
 * @property {number}   break_facing_direction          - degrees (0–360)
 * @property {number[]} optimal_swell_directions        - array of degrees
 * @property {number}   swell_direction_tolerance       - degrees of acceptable deviation
 * @property {number}   min_rideable_ft
 * @property {number}   optimal_height_min_ft
 * @property {number}   optimal_height_max_ft
 * @property {number}   max_rideable_ft
 * @property {number}   min_period_s
 * @property {number[]} optimal_tide_range_ft           - [min, max] MLLW
 * @property {string}   tide_preference                 - "low" | "mid" | "high" | "any"
 * @property {Object}   weights                         - override default scoring weights for this spot
 * @property {string}   notes                           - human-readable forecasting notes
 */

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT SCORING WEIGHTS
// Override per-spot in the `weights` field if needed.
// ─────────────────────────────────────────────────────────────────────────────
// Height is de-emphasized — users see forecast size in the UI; rating focuses on quality factors.
export const DEFAULT_WEIGHTS = {
  height:    0.20,
  period:    0.213,
  direction: 0.213,
  wind:      0.267,
  tide:      0.107,
};

// ─────────────────────────────────────────────────────────────────────────────
// SPOT CONFIGURATIONS
// ─────────────────────────────────────────────────────────────────────────────

/** @type {SpotConfig[]} */
export const SPOT_CONFIGS = [

  // ───────────────────────────────────────────────────────────────────────────
  {
    id:     "ocean_beach_sf",
    name:   "Ocean Beach",
    region: "San Francisco",
    latitude:  37.7594,
    longitude: -122.5107,

    break_type: "beach",
    difficulty: "advanced",

    // Faces due west. Powerful shore break driven by open-ocean NW/W swells.
    break_facing_direction: 270,

    // Works best on NW and WNW swells. Due-W swells also work.
    // Pure N swells (0°) are blocked by the headlands; S swells don't reach here.
    optimal_swell_directions: [300, 285],
    swell_direction_tolerance: 30,

    // Heavy, punishing beach break — not suitable when tiny or massive.
    min_rideable_ft:      3,
    optimal_height_min_ft: 4,
    optimal_height_max_ft: 8,
    max_rideable_ft:       14,

    // OB needs real swell period to avoid pure shore dump.
    min_period_s: 10,

    // Best at mid tide. Low tide = too shallow, violent shore dump.
    // High tide pushes water up the beach, shrinking the surf zone.
    // Very high tide = closeout shore dump.
    optimal_tide_range_ft: [1.5, 3.5],
    tide_preference: "mid",

    // Period matters more at OB than a typical beachbreak because
    // long-period swells focus energy on the sandbars differently.
    weights: {
      height:    0.20,
      period:    0.267, // bumped up
      direction: 0.213,
      wind:      0.213, // slightly reduced — OB can handle moderate onshores
      tide:      0.107,
    },

    notes: `
      Ocean Beach is one of the most powerful beach breaks in the world.
      It requires proper NW/WNW groundswell with enough period (10s+) to
      generate organized, rideable peaks rather than shore dump.
      Even moderately offshore (N/NE) winds keep it clean.
      Strong S winds are rare but blow it out completely.
      Sandbars shift seasonally — quality varies dramatically by location
      along the 3-mile stretch. The area near Sloat Blvd (middle) tends
      to hold sandbars best in winter. Avoid at all costs in strong onshore wind.
      Rip currents are severe; not beginner territory.
    `,
  },

  // ───────────────────────────────────────────────────────────────────────────
  {
    id:     "linda_mar",
    name:   "Linda Mar",
    region: "Pacifica",
    latitude:  37.5943,
    longitude: -122.5004,

    break_type: "beach",
    difficulty: "beginner",

    // Faces WSW. Slightly more southerly aspect than OB,
    // giving it a wider swell window and more protection from north winds.
    break_facing_direction: 255,

    // Works on NW through W swells. Also picks up some W/SW swell.
    // The surrounding headlands provide partial shelter from extreme NW swells.
    optimal_swell_directions: [290, 270],
    swell_direction_tolerance: 40, // wide window — forgiving beachbreak

    // Gentler and more consistent than OB. Excellent for all levels.
    min_rideable_ft:       1.5,
    optimal_height_min_ft: 2,
    optimal_height_max_ft: 5,
    max_rideable_ft:       8,

    min_period_s: 8,

    // Works across a broad tide range. Slightly better at mid-high
    // when the beach has a good slope and bars are submerged just enough.
    optimal_tide_range_ft: [1.0, 3.5],
    tide_preference: "mid",

    // Tide matters less here — use default weights
    weights: { ...DEFAULT_WEIGHTS },

    notes: `
      Linda Mar (Pacifica) is the most beginner-friendly break on this list.
      Sheltered by Pedro Point to the south and hills to the north, it's
      often glassy when OB is blown out by N winds.
      Works on a wide range of swell directions and sizes.
      Very consistent — almost always has rideable surf when anywhere else does.
      South/SE winds are the nemesis; they blow directly onshore.
      Best in the morning before any sea breeze kicks in.
      Mellow shore break, minimal rip current. Great for longboards.
    `,
  },

  // ───────────────────────────────────────────────────────────────────────────
  {
    id:     "bolinas",
    name:   "Bolinas",
    region: "Marin County",
    latitude:  37.9079,
    longitude: -122.7143,

    break_type: "beach",
    difficulty: "intermediate",

    // Faces WNW. Sits at the mouth of Bolinas Lagoon.
    // The lagoon channel creates shifting sandbars.
    break_facing_direction: 290,

    // Best on NW swells. Can also work on W swells.
    // Very sheltered from due-N and S swells.
    optimal_swell_directions: [310, 285],
    swell_direction_tolerance: 30,

    min_rideable_ft:       2,
    optimal_height_min_ft: 3,
    optimal_height_max_ft: 6,
    max_rideable_ft:       9,

    min_period_s: 9,

    // Highly tide-dependent due to the lagoon channel.
    // Incoming mid tide is the sweet spot — bars are covered enough
    // to prevent closeout, and the lagoon current isn't too strong.
    // Low tide can be too shallow and exposing rocks near the channel.
    // High tide pushes the break too close to shore.
    optimal_tide_range_ft: [1.5, 3.0],
    tide_preference: "mid",

    // Tide is more critical here than at a standard beachbreak
    weights: {
      height:    0.20,
      period:    0.192,
      direction: 0.213,
      wind:      0.235,
      tide:      0.160, // bumped up — lagoon dynamics make tide more impactful
    },

    notes: `
      Bolinas sits at the mouth of Bolinas Lagoon in Marin County.
      The channel creates shifting sandbars that can be world-class
      on a good day or completely flat and confusing on another.
      Very uncrowded relative to quality — a local secret (sort of).
      NE/E winds are offshore. Susceptible to strong N winds which
      blow cross-shore and create chop.
      Needs a mid-incoming tide to avoid the lagoon current working
      against the paddling. Rarely crowded.
    `,
  },

  // ───────────────────────────────────────────────────────────────────────────
  {
    id:     "steamer_lane",
    name:   "Steamer Lane",
    region: "Santa Cruz",
    latitude:  36.9514,
    longitude: -122.0269,

    break_type: "reef_point",
    difficulty: "advanced",

    // Faces NW. Multiple sections: Indicators (outside), Middle Peak, The Slot.
    // This is the primary direction for the main peaks.
    break_facing_direction: 315,

    // The Lane is famously tuned to NW swells. W swells also work well.
    // Both directions are scored — take the higher score.
    optimal_swell_directions: [315, 290],
    swell_direction_tolerance: 25, // reef/point breaks are more direction-sensitive

    // World-class reef point. Can handle significant size.
    // Below 3ft it gets too small for the reef to work properly.
    min_rideable_ft:       3,
    optimal_height_min_ft: 5,
    optimal_height_max_ft: 12,
    max_rideable_ft:       20,

    // Needs real groundswell period for the reef to work properly.
    min_period_s: 11,

    // Works at most tide levels, but:
    // Low tide can expose sections of the reef and create dangerous ledges.
    // High tide softens the break but reduces hollowness.
    // Mid tide is the sweet spot across all sections.
    optimal_tide_range_ft: [1.5, 4.0],
    tide_preference: "mid",

    // Swell direction matters enormously here — reef points are picky.
    // Period also critical; the reef needs energy to focus properly.
    weights: {
      height:    0.17,
      period:    0.245, // bumped — reef needs real period to fire
      direction: 0.266, // bumped — reef is very direction-sensitive
      wind:      0.234,
      tide:      0.085,
    },

    notes: `
      Steamer Lane is one of the best and most consistent surf spots in
      California. The reef amplifies NW groundswell into powerful, hollow,
      long-period waves.
      E/NE offshore winds are common in the morning before sea breeze.
      The Lane handles size well — Indicators can work on huge swells
      that would close out most spots.
      Very competitive lineup. Can get extremely crowded.
      South swells occasionally wrap in but are much smaller and softer.
      Kelp helps smooth surface texture. Cold water year-round.
    `,
  },

  // ───────────────────────────────────────────────────────────────────────────
  {
    id:     "montara",
    name:   "Montara",
    region: "San Mateo County",
    latitude:  37.5413,
    longitude: -122.5183,

    break_type: "beach",
    difficulty: "intermediate",

    // Faces due west. Exposed beach with no significant headland shelter.
    break_facing_direction: 272,

    // Open to NW through W swells. Slightly less protected than Linda Mar.
    optimal_swell_directions: [300, 275],
    swell_direction_tolerance: 35,

    min_rideable_ft:       2,
    optimal_height_min_ft: 3,
    optimal_height_max_ft: 7,
    max_rideable_ft:       10,

    min_period_s: 9,

    // Mid tide is most reliable. The beach slope can cause shore dump
    // at low tide; high tide pushes the break shallow against the cliff.
    optimal_tide_range_ft: [1.5, 3.5],
    tide_preference: "mid",

    weights: { ...DEFAULT_WEIGHTS },

    notes: `
      Montara is an exposed, no-frills beach break on the San Mateo coast.
      More raw and powerful than Linda Mar due to less headland protection.
      Gets less crowd than the Pacifica spots.
      Rocky entry/exit — be careful at low tide.
      E/NE winds are offshore. Afternoon NW winds blow cross-shore.
      Can have strong rip currents especially on bigger swells.
      Parking is straightforward but limited. Worth checking when Linda Mar
      is overcrowded, as it often has similar conditions with fewer people.
    `,
  },

  // ───────────────────────────────────────────────────────────────────────────
  {
    id:     "half_moon_bay_surfers_beach",
    name:   "Half Moon Bay (Surfers Beach)",
    region: "Half Moon Bay",
    latitude:  37.4963,
    longitude: -122.4927,

    break_type: "beach",
    difficulty: "intermediate",

    // Faces W/WSW. Positioned just south of Pillar Point, which provides
    // partial shelter from the largest direct NW swells.
    break_facing_direction: 263,

    // Works best on W through NW swells. The Pillar Point headland blocks
    // some of the energy from very NW-angled swells, making a slightly more
    // westerly swell angle ideal here vs. spots further north.
    optimal_swell_directions: [280, 265],
    swell_direction_tolerance: 35,

    min_rideable_ft:       2,
    optimal_height_min_ft: 3,
    optimal_height_max_ft: 6,
    max_rideable_ft:       9,

    min_period_s: 9,

    // Works across a mid range of tides.
    optimal_tide_range_ft: [1.0, 3.5],
    tide_preference: "mid",

    weights: { ...DEFAULT_WEIGHTS },

    notes: `
      Surfers Beach is the main accessible beach break in Half Moon Bay.
      Pillar Point to the north provides partial shelter — when OB or Montara
      are massive and closing out, this spot can offer smaller, more organized surf.
      Works well for intermediate surfers on overhead-and-under days.
      E/NE winds are offshore. Consistent year-round.
      Note: This is the beach break. Mavericks (offshore reef) is a completely
      separate config — do not confuse them despite their proximity.
      Good parking and beach access. Consistent crowd but rarely overcrowded.
    `,
  },

  // ───────────────────────────────────────────────────────────────────────────
  {
    id:     "mavericks",
    name:   "Mavericks",
    region: "Half Moon Bay",
    latitude:  37.4955,
    longitude: -122.4994,

    break_type: "reef",
    difficulty: "expert",

    // Faces NW. Offshore reef break outside Pillar Point.
    break_facing_direction: 310,

    // Mavericks is extremely direction-sensitive. It requires large NW
    // groundswell. Due-W swells can work but are less ideal.
    // S or SW swells: blocked entirely.
    optimal_swell_directions: [310, 295],
    swell_direction_tolerance: 20, // very tight — reef is picky at big wave scale

    // This is a BIG WAVE SPOT. Under 15ft it doesn't really "turn on."
    // The reef needs significant swell energy to organize into the
    // characteristic massive peaks and barrels.
    min_rideable_ft:       15,
    optimal_height_min_ft: 20,
    optimal_height_max_ft: 45,
    max_rideable_ft:       70, // theoretical; conditions at 60ft+ are life-threatening

    // Long-period NW groundswell only. Wind swell is irrelevant at this spot.
    min_period_s: 15,

    // Works at most tide levels when it's on — at 20ft+ the reef is
    // always covered. Very high tides can slightly soften the break.
    optimal_tide_range_ft: [1.0, 4.5],
    tide_preference: "any",

    // At a big wave spot, period and direction are everything.
    // Height is less of a discriminator (it's always big enough or it isn't).
    // Wind still matters for safety and wave face quality.
    weights: {
      height:    0.10, // reduced — it's almost binary (on/off)
      period:    0.370, // critical — needs long-period swell to generate power
      direction: 0.318, // critical — the reef only catches specific NW angles
      wind:      0.159, // still matters for safety, but secondary concern
      tide:      0.053,
    },

    notes: `
      Mavericks is one of the premier big wave breaks in the world.
      It ONLY turns on during significant NW groundswell events — typically
      winter storms in the Gulf of Alaska generating 20s+ period swells.
      Completely flat or irrelevant during average conditions.
      This config should probably trigger a special "BIG WAVE ALERT" UI state
      rather than a standard 0–100 score when height >= 15ft.
      E/NE offshore winds (common in winter mornings) keep the massive
      faces clean. Onshore wind at this size is extremely dangerous.
      Crowd: invitation-only big wave events held here. Not a public break
      in the traditional sense. Access is by boat or very long paddle.
      Consider showing this spot as "Dormant" when swell_height < 15ft
      and "Active" when >= 15ft, rather than a typical surf rating.
    `,
  },

  // ───────────────────────────────────────────────────────────────────────────
  {
    id:     "pleasure_point",
    name:   "Pleasure Point",
    region: "Santa Cruz",
    latitude:  36.9586,
    longitude: -121.9736,

    break_type: "reef_point",
    difficulty: "intermediate",

    // Faces SW/WSW. The point juts southward, so NW and W swells
    // wrap around the point to create long, peeling rights.
    // This is the effective facing direction for scoring purposes.
    break_facing_direction: 235,

    // NW and W swells wrap around the point — this refraction makes
    // the effective swell angle more southerly than the actual swell.
    // W swells (270°) arrive and refract to behave like SW swells at the break.
    // Pure SW swells (225°) also hit this break directly.
    // This spot has one of the wider swell windows of any reef/point.
    optimal_swell_directions: [270, 240, 210],
    swell_direction_tolerance: 35, // wider than Steamer due to refraction wrapping

    // More mellow than Steamer Lane. Works great for longboards and
    // intermediate surfers. Multiple peaks along the point.
    min_rideable_ft:       2,
    optimal_height_min_ft: 3,
    optimal_height_max_ft: 7,
    max_rideable_ft:       10,

    min_period_s: 10,

    // Works well across a broad tide range. Some sections are
    // better at lower tide (hollower), others at higher (longer rides).
    optimal_tide_range_ft: [0.5, 4.0],
    tide_preference: "any",

    // The refraction and wide swell window make direction slightly less
    // punishing than Steamer Lane. Wind is important for surface quality.
    weights: {
      height:    0.20,
      period:    0.234,
      direction: 0.192, // slightly reduced — wide swell window from refraction
      wind:      0.267,
      tide:      0.107,
    },

    notes: `
      Pleasure Point is the more accessible, mellow counterpart to Steamer Lane.
      NW and W swells wrap around the point and create long, peeling rights
      suitable for all skill levels.
      N/NE winds are offshore. Morning glass is common.
      Less crowded than Steamer Lane despite being nearby.
      Three main sections: First Peak (most exposed, longest rides),
      Second Peak (slightly protected), and 38th Ave (most beginner-friendly).
      Summer S swells also directly hit this spot, making it one of the
      few breaks on this list that gets summer surf without wrap-around.
      Works well on longboards at smaller sizes (2–4ft).
      Rocky reef entry/exit — booties recommended.
    `,
  },

];

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: look up a spot config by ID
// ─────────────────────────────────────────────────────────────────────────────
export function getSpotConfig(spotId) {
  return SPOT_CONFIGS.find(s => s.id === spotId) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: get all spot IDs and names (useful for dropdowns / UI lists)
// ─────────────────────────────────────────────────────────────────────────────
export function getSpotList() {
  return SPOT_CONFIGS.map(({ id, name, region, difficulty }) => ({
    id,
    name,
    region,
    difficulty,
  }));
}
