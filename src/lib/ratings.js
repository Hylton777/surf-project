import { THEME } from "../theme.js";

const getRatingDisplayColor = label => {
  const map = {
    Pumping: "#14532d",
    Good: "#16a34a",
    Smooth: "#0d9488",
    Decent: "#f59e0b",
    Bad: "#f97316",
    Poor: "#dc2626",
    Dormant: "#000000",
  };
  return map[label] || THEME.textSoft;
};
export { getRatingDisplayColor };

