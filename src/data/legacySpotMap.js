import { SPOT_CONFIGS } from "./spotConfigs.js";

export const LEGACY_SPOT_CONFIG_ID = {
  ob: "ocean_beach_sf",
  linda_mar: "linda_mar",
  bolinas: "bolinas",
  steamer_lane: "steamer_lane",
  montara: "montara",
  hmb_surfers_beach: "half_moon_bay_surfers_beach",
  mavs: "mavericks",
  pleasure_point: "pleasure_point",
};

export const SPOT_CONFIG_BY_ID = SPOT_CONFIGS.reduce((acc, cfg) => {
  acc[cfg.id] = cfg;
  return acc;
}, {});
