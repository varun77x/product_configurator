// Hardcoded SKU data for VicStrip Panels
// Each pattern has 16 colors

const COLORS = [
  { id: "alpine-frost", name: "Alpine Frost", hex: "#BCB9AB" },
  { id: "amber-walnut", name: "Amber Walnut", hex: "#A4A499" },
  { id: "auburn-oak", name: "Auburn Oak", hex: "#C99E61" },
  { id: "bourbon-walnut", name: "Bourbon Walnut", hex: "#41322B" },
  { id: "carbon-black", name: "Carbon Black", hex: "#1C1C1C" },
  { id: "glacier-white", name: "Glacier White", hex: "#F8F8F8" },
  { id: "lunar-ash", name: "Lunar Ash", hex: "#B0B0B0" },
  { id: "merlot", name: "Merlot", hex: "#721F1F" },
  { id: "monarch-oak", name: "Monarch Oak", hex: "#8B5A2B" },
  { id: "obsidian-black", name: "Obsidian Black", hex: "#5B5849" },
  { id: "sage-green", name: "Sage Green", hex: "#838E7C" },
  { id: "sierra-elm", name: "Sierra Elm", hex: "#9D5B37" },
  { id: "silver-birch", name: "Silver Birch", hex: "#C7BAA5" },
  { id: "solara", name: "Solara", hex: "#78756C" },
  { id: "toffee-oak", name: "Toffee Oak", hex: "#B17547" },
  { id: "windsor-oak", name: "Windsor Oak", hex: "#B5A680" },
];

const PATTERNS = [
  {
    id: "single-groove",
    name: "Single Groove",
    colors: COLORS,
  },
  {
    id: "double-groove",
    name: "Double Groove",
    colors: COLORS,
  },
  {
    id: "square",
    name: "Square",
    colors: COLORS,
  },
  {
    id: "double-square",
    name: "Double Square",
    colors: COLORS,
  },
];

export const VICSTRIP_PRODUCT = {
  id: "vicstrip",
  name: "VicStrip Panels",
  patterns: PATTERNS,
};

// Helper function to get image path
export const getImagePath = (patternId, colorId) => {
  return `/images/texture_images/${patternId}/${colorId}.jpg`;
};
