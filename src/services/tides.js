import { getForecastDateBounds, shiftForecastDate } from "./openMeteo.js";

const fetchTides = stationId => {
  const pad = n => String(n).padStart(2, "0");
  const { min, max } = getForecastDateBounds();
  const endExclusive = shiftForecastDate(max, 1);
  const fmt = dateStr => dateStr.replace(/-/g, "");
  return fetch(`https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?begin_date=${fmt(min)}&end_date=${fmt(endExclusive)}&station=${stationId}&product=predictions&datum=MLLW&time_zone=lst_ldt&interval=hilo&units=english&application=cs153&format=json`)
    .then(r => r.json());
};
export { fetchTides };

