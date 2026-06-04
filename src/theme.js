export const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Space+Mono:wght@400;700&family=Inter:wght@300;400;500;600&display=swap');`;

export const THEME = {
  bg: "#dff4ff",
  bgSoft: "#f2fbff",
  panel: "#ffffff",
  panelAlt: "#fff8ec",
  border: "#bfe4ee",
  text: "#0f4f66",
  textStrong: "#0a3f52",
  textSoft: "#4f8ca3",
  muted: "#79aebf",
  accent: "#2bb7a7",
  accentSoft: "rgba(43,183,167,0.16)",
};

export const SCENIC_BG_URL = "/surf-bg.png";

export const POSTCARD_BG = `
  linear-gradient(180deg, rgba(232,247,255,0.72) 0%, rgba(222,242,248,0.76) 42%, rgba(247,237,214,0.8) 100%),
  radial-gradient(circle at 18% 14%, rgba(255,255,255,0.78) 0%, rgba(255,255,255,0.18) 34%),
  linear-gradient(180deg, rgba(9, 55, 74, 0.08) 0%, rgba(9, 55, 74, 0.04) 60%, rgba(9, 55, 74, 0.02) 100%),
  url("${SCENIC_BG_URL}"),
  linear-gradient(
    180deg,
    #b9ecff 0%,
    #8dd9f3 30%,
    #75d1cd 52%,
    #f4e3bf 53%,
    #efd6a8 100%
  )
`;
