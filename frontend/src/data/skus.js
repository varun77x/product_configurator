// Hardcoded SKU data for VicStrip Panels
// Each pattern has 16 colors

const COLORS = [
  { id: "alpine-frost", name: "Alpine Frost", hex: "#E0FFFF" },
  { id: "amber-walnut", name: "Amber Walnut", hex: "#8B4513" },
  { id: "auburn-oak", name: "Auburn Oak", hex: "#A0522D" },
  { id: "bourbon-walnut", name: "Bourbon Walnut", hex: "#654321" },
  { id: "carbon-black", name: "Carbon Black", hex: "#1C1C1C" },
  { id: "glacier-white", name: "Glacier White", hex: "#F8F8F8" },
  { id: "lunar-ash", name: "Lunar Ash", hex: "#B0B0B0" },
  { id: "merlot", name: "Merlot", hex: "#721F1F" },
  { id: "monarch-oak", name: "Monarch Oak", hex: "#8B5A2B" },
  { id: "obsidian-black", name: "Obsidian Black", hex: "#0B0B0B" },
  { id: "sage-green", name: "Sage Green", hex: "#6B8E23" },
  { id: "sierra-elm", name: "Sierra Elm", hex: "#9F8F6F" },
  { id: "silver-birch", name: "Silver Birch", hex: "#C0C0C0" },
  { id: "solara", name: "Solara", hex: "#FF8C00" },
  { id: "toffee-oak", name: "Toffee Oak", hex: "#A67C52" },
  { id: "windsor-oak", name: "Windsor Oak", hex: "#7B5C3F" },
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
