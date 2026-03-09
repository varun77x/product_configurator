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

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:8001";

// Helper function to get VicStrip image path (served from backend)
export const getImagePath = (patternId, colorId) => {
  return `${BACKEND_URL}/static/images/vicstrip/${patternId}/${colorId}.jpg`;
};

// ─── Flat / Embossed VMT Panels ──────────────────────────────────────────────

/**
 * Per-category config for the Flat Embossed VMT layered preview.
 * Keys must match the category IDs returned by the backend API
 * (generated as: "vmd-" + category.toLowerCase().replace(/ /g,"-").replace(/&/g,"and"))
 *
 * How to add a new category:
 *   1. Add an entry below with the correct backend category ID as the key.
 *   2. Place assets in the corresponding folders:
 *        furniture : /images/flat-embossed-vmt/furniture/{categoryId}.png
 *        tpatti    : /images/flat-embossed-vmt/tpatti/{categoryId}.png  (optional)
 *        panels    : /images/flat-embossed-vmt/panels/{categoryId}/{designCode}.jpg
 */
export const FLAT_EMBOSSED_VMT_CONFIG = {
  "vmd-line-and-texture": {
    /** PNG with transparent wall cutout — furniture drives canvas height */
    furniture: `${BACKEND_URL}/static/images/flat-embossed-vmt/furniture/vmd-line-and-texture.png`,
    /** Optional decorative overlay PNG. Set to null if none. */
    tpatti: `${BACKEND_URL}/static/images/flat-embossed-vmt/tpatti/vmd-line-and-texture.png`,
    renderMode: "portrait",
    /** Number of panel columns shown side-by-side */
    repeat: 3,
    /** Real physical dimensions (mm) — used for CSS aspect-ratio */
    panelWidth: 1200,
    panelHeight: 2800,
  },
  "vmd-rhythm-and-repeat": {
    furniture: `${BACKEND_URL}/static/images/flat-embossed-vmt/furniture/vmd-rhythm-and-repeat.png`,
    tpatti: `${BACKEND_URL}/static/images/flat-embossed-vmt/tpatti/vmd-rhythm-and-repeat.png`,
    renderMode: "portrait",
    repeat: 3,
    panelWidth: 1200,
    panelHeight: 2800,
  },
  "vmd-quiet-bloom": {
    furniture: `${BACKEND_URL}/static/images/flat-embossed-vmt/furniture/vmd-quiet-bloom.png`,
    tpatti: `${BACKEND_URL}/static/images/flat-embossed-vmt/tpatti/vmd-quiet-bloom.png`,
    renderMode: "portrait",
    repeat: 3,
    panelWidth: 1200,
    panelHeight: 2800,
  },
  "vmd-fun-and-fantasy": {
    furniture: `${BACKEND_URL}/static/images/flat-embossed-vmt/furniture/vmd-fun-and-fantasy.png`,
    tpatti: `${BACKEND_URL}/static/images/flat-embossed-vmt/tpatti/vmd-fun-and-fantasy.png`,
    renderMode: "portrait",
    repeat: 3,
    panelWidth: 1200,
    panelHeight: 2800,
  },
  "vmd-indian-modern": {
    furniture: `${BACKEND_URL}/static/images/flat-embossed-vmt/furniture/vmd-indian-modern.png`,
    tpatti: `${BACKEND_URL}/static/images/flat-embossed-vmt/tpatti/vmd-indian-modern.png`,
    renderMode: "portrait",
    repeat: 3,
    panelWidth: 1200,
    panelHeight: 2800,
  },
  "vmd-color-block": {
    furniture: `${BACKEND_URL}/static/images/flat-embossed-vmt/furniture/vmd-color-block.png`,
    tpatti: `${BACKEND_URL}/static/images/flat-embossed-vmt/tpatti/vmd-color-block.png`,
    renderMode: "portrait",
    repeat: 3,
    panelWidth: 1200,
    panelHeight: 2800,
  },
};

/**
 * Fallback config used when categoryId is not found in FLAT_EMBOSSED_VMT_CONFIG.
 * Falls back to "Line & Texture" furniture so the preview is never blank.
 */
export const FLAT_EMBOSSED_VMT_DEFAULT_CONFIG = {
  furniture: `${BACKEND_URL}/static/images/flat-embossed-vmt/furniture/vmd-line-and-texture.png`,
  tpatti: null,
  renderMode: "portrait",
  repeat: 3,
  panelWidth: 1200,
  panelHeight: 2800,
};

/**
 * Emboss pattern overlays for Flat Embossed VMT panels.
 * Each entry mirrors what the backend API will eventually return:
 *   id           — unique pattern identifier
 *   name         — display name
 *   thumbnailUrl — absolute CDN/backend URL for the overlay PNG
 *   availableSizes — which panel sizes support this pattern
 *
 * Rendered as a layer between the panels layer and the T-Patti layer.
 * To add a pattern: drop the PNG in /images/flat-embossed-vmt/emboss/
 * and add an entry here.
 */
export const FLAT_EMBOSSED_EMBOSS_PATTERNS = [
  // No patterns added yet. Example entry:
  // {
  //   id: "wave",
  //   name: "Wave",
  //   thumbnailUrl: `${BACKEND_URL}/static/images/flat-embossed-vmt/emboss/wave.png`,
  //   availableSizes: ["1200x2400", "1200x2800"],
  // },
];

/**
 * Converts a relative backend asset path (e.g. "/static/images/...")
 * to a fully-qualified URL using the backend base URL.
 * Already-absolute URLs (http/https) are returned unchanged.
 */
export const resolveAssetUrl = (path) => {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${BACKEND_URL}${path}`;
};

/**
 * Returns the backend path(s) for a panel texture.
 *
 * - "single"     (default) → returns a string:  …/{designCode}.jpg
 * - "continuous"           → returns a string[]: …/{designCode}-1.jpg, -2.jpg, -3.jpg
 *
 * File-naming convention for continuous panels:
 *   panels/{categoryId}/{designCode}-1.jpg   ← left column
 *   panels/{categoryId}/{designCode}-2.jpg   ← centre column
 *   panels/{categoryId}/{designCode}-3.jpg   ← right column
 *
 * @param {string} categoryId     - e.g. "vmd-line-and-texture"
 * @param {string} designCode     - e.g. "VMD-LT-009"
 * @param {"single"|"continuous"} [panelVariant="single"]
 * @param {number} [count=3]      - number of slices for continuous designs (3, 4, …)
 */
export const getFlatEmbossedPanelPath = (categoryId, designCode, panelVariant = "single", count = 3) => {
  const base = `${BACKEND_URL}/static/images/flat-embossed-vmt/panels/${categoryId}`;
  if (panelVariant === "continuous") {
    return Array.from({ length: count }, (_, i) => `${base}/${designCode}-${i + 1}.jpg`);
  }
  return `${base}/${designCode}.jpg`;
};
