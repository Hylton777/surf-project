const fetchMarine = (lat, lon) =>
  fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&hourly=wave_height,wave_period,wave_peak_period,wave_direction,swell_wave_height,swell_wave_period,swell_wave_peak_period,swell_wave_direction,secondary_swell_wave_height,secondary_swell_wave_period,secondary_swell_wave_direction,wind_wave_height,wind_wave_period,wind_wave_peak_period,wind_wave_direction&past_days=1&forecast_days=2&timezone=auto`)
    .then(r => r.json());

const fetchWind = (lat, lon) =>
  fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=wind_speed_10m,wind_direction_10m&past_days=1&forecast_days=2&timezone=auto&wind_speed_unit=mph`)
    .then(r => r.json());

const LA_FORECAST_TZ = "America/Los_Angeles";

const todayForecastDate = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: LA_FORECAST_TZ });

const shiftForecastDate = (dateStr, deltaDays) => {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + deltaDays);
  return d.toLocaleDateString("en-CA", { timeZone: LA_FORECAST_TZ });
};

const getForecastDateBounds = () => {
  const today = todayForecastDate();
  return { today, min: shiftForecastDate(today, -1), max: shiftForecastDate(today, 1) };
};

const formatForecastNavDate = dateStr =>
  new Date(`${dateStr}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: LA_FORECAST_TZ,
  });

const formatForecastCenterLabel = dateStr => {
  const { today, min, max } = getForecastDateBounds();
  if (dateStr === today) return "Today";
  if (dateStr === min) return "Yesterday";
  if (dateStr === max) return "Tomorrow";
  return formatForecastNavDate(dateStr);
};
export {
  fetchMarine,
  fetchWind,
  LA_FORECAST_TZ,
  todayForecastDate,
  shiftForecastDate,
  getForecastDateBounds,
  formatForecastNavDate,
  formatForecastCenterLabel,
};

