export const BedtimeTheme = {
  colors: {
    bgTop: "#0B1026",
    bgMid: "#121A3A",
    bgBottom: "#1B2B5A",

    card: "rgba(255,255,255,0.10)",
    cardBorder: "rgba(255,255,255,0.14)",

    text: "#F2F5FF",
    textMuted: "rgba(242,245,255,0.72)",

    accent: "#B9A6FF",       // lavender
    accent2: "#7CD7FF",      // soft cyan
    button: "rgba(185,166,255,0.95)",
    buttonText: "#0B1026",

    chip: "rgba(255,255,255,0.12)",
    chipSelected: "rgba(185,166,255,0.28)",
    chipBorder: "rgba(255,255,255,0.18)",
    chipBorderSelected: "rgba(185,166,255,0.55)",

    danger: "rgba(255,120,120,0.92)",
  },
  radius: {
    xl: 26,
    lg: 18,
    md: 14,
  },
  shadow: {
    // RN shadow (iOS) + elevation (Android)
    card: {
      shadowColor: "#000",
      shadowOpacity: 0.35,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 10 },
      elevation: 6,
    },
  },
};