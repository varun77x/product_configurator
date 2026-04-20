import { useState, useEffect, useCallback, useRef, memo, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useRenderLog } from "@/hooks/use-render-log";
// import axios from "axios"; // removed: product catalog + specs now fetched from CDN JSON
import { toast } from "sonner";
import { Download, Heart, Trash2, RefreshCw, Shield, Flame, Leaf, Award, ZoomIn, ZoomOut, X, FileText, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import CanvasPreview from "@/components/CanvasPreview";
import FlatEmbossedPreview, { preloadImages } from "@/components/FlatEmbossedPreview";
import VicStripPreview from "@/components/VicStripPreview";
import { VICSTRIP_PRODUCT, getImagePath, getFlatEmbossedPanelPath, FLAT_EMBOSSED_VMT_CONFIG, resolveAssetUrl, FLAT_EMBOSSED_EMBOSS_PATTERNS, WOOD_PERFORATION_SIZES, WOOD_PERFORATION_PATTERNS, WOOD_PERFORATION_EXCLUSIONS, COLOR_CORE_COLORS, COLOR_CORE_FABRIC_STRUCTURES, getColorCorePanelUrl, getColorCoreThumbnailUrl, COLOR_CORE_EMBOSS_PATTERNS, COLOR_CORE_SIZES, getColorCoreEmbossUrl, OMBRE_COLOR_CORE_BASE_COLORS, OMBRE_COLOR_CORE_OVERLAYS, getOmbreColorCorePanelUrl, OMBRE_COLOR_CORE_EMBOSS_PATTERNS, getOmbreEmbossPanelUrl, OMBRE_COLOR_CORE_GROOVE_PATTERNS, getOmbreGroovePanelUrl, DESIGNER_TEXTILE_COLOR_GROUPS, DESIGNER_TEXTILE_FABRICS, DESIGNER_TEXTILE_SIZES, DESIGNER_TEXTILE_THICKNESSES, getDesignerTextileThumbnailUrl, DESIGNER_TEXTILE_EMBOSS_PATTERNS, getDesignerTextileEmbossUrl, getVicstripThumbnailUrl } from "@/data/skus";
import { useBlobPanel, useMultiBlobPanels } from "@/hooks/use-blob-panel";
import { downloadPanelImages } from "@/lib/downloadPanelImages";
import SignatureOmbreRoomPreview from "@/components/SignatureOmbreRoomPreview";
import SignatureOmbreLightRing from "@/components/SignatureOmbreLightRing";
import { OmbreEmbossEngine } from "@/lib/OmbreEmbossEngine";
import ChatWidget from "@/components/ChatWidget";

// const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
// const API = `${BACKEND_URL}/api`;
// Products catalog + tech specs are now fetched as static JSON from the CDN.
const ASSETS_URL = process.env.REACT_APP_ASSETS_URL || "http://localhost:8001";

// Boot loader toggles (quickly reversible without touching JSX)
const ENABLE_BOOT_WHITE_OVERLAY = true;
const BOOT_OVERLAY_EXTRA_MS = 500;

// ── Signature Ombre: 6 emboss patterns with OBJ models ──────────────────────
const SO_PATTERNS = [
  { id: 'ribbed-25',   name: 'Ribbed 25',   modelUrl: '/models/emboss/ribbed-25.obj' },
  { id: 'ribbed-45',   name: 'Ribbed 45',   modelUrl: '/models/emboss/ribbed-45.obj' },
  { id: 'ribbed-60',   name: 'Ribbed 60',   modelUrl: '/models/emboss/ribbed-60.obj' },
  { id: 'ribbed-duo',  name: 'Ribbed Duo',  modelUrl: '/models/emboss/ribbed-duo.obj' },
  { id: 'tapered',     name: 'Tapered',     modelUrl: '/models/emboss/tapered.obj' },
  { id: 'flux-ribbed', name: 'Flux Ribbed', modelUrl: '/models/emboss/flux-ribbed.obj' },
];
const SO_PAT_ICONS = {
  'ribbed-25':   'M4,2v20M8,2v20M12,2v20M16,2v20M20,2v20',
  'ribbed-45':   'M3,2v20M7,2v20M11,2v20M15,2v20M19,2v20M21,2v20',
  'ribbed-60':   'M2,2v20M6,2v20M10,2v20M18,2v20M22,2v20',
  'ribbed-duo':  'M3,2v20M5,2v20M10,2v20M12,2v20M17,2v20M19,2v20',
  'tapered':     'M4,2v20M8,4v16M12,6v12M16,4v16M20,2v20',
  'flux-ribbed': 'M3,2v20M6,2v20M10,2v20M14,2v20M17,2v20M21,2v20',
};

// NRC hover hints for flat-embossed-vmd thickness options
const THICKNESS_NRC_HINTS = {
  "12mm (PET Panel)": "0.45 NRC can be increased to 0.9 (See Tech Specs for further details)",
  "25mm (PET Panel)": "0.6 NRC can be increased to 0.9 (See Tech Specs for further details)",
  "PET Wool":         "0.7 NRC can be increased to 0.9 (See Tech Specs for further details)",
};

// Technical specs data (fallback)
const DEFAULT_SPECS = {
  "flat-embossed-vmd": {
    fire_rating: "Class A (ASTM E84)",
    nrc_rating: "0.85 - 0.95",
    sustainability: ["FSC Certified", "GREENGUARD Gold", "Red List Free"],
    material: "High-Density Polyester Fiber",
    thickness_mm: "12-25mm",
    weight_kg_m2: "2.4 - 4.8",
    installation: "Adhesive / Mechanical Fix",
    warranty: "10 Years",
    certifications: ["ISO 14001", "ISO 9001", "OEKO-TEX Standard 100"]
  },
  "ombre": {
    fire_rating: "Class A (ASTM E84)",
    nrc_rating: "0.80 - 0.90",
    sustainability: ["Recycled Content 60%", "GREENGUARD Gold", "Red List Free"],
    material: "HD Acoustic Felt",
    thickness_mm: "9-12mm",
    weight_kg_m2: "1.8 - 2.2",
    installation: "Adhesive Mount",
    warranty: "8 Years",
    certifications: ["ISO 14001", "Declare Label", "HPD"]
  },
  "vicstrip": {
    fire_rating: "Class B (ASTM E84)",
    nrc_rating: "0.70 - 0.85",
    sustainability: ["FSC Certified Wood", "Low VOC", "Red List Free"],
    material: "MDF Core + Acoustic Backing",
    thickness_mm: "12-25mm",
    weight_kg_m2: "3.2 - 5.5",
    installation: "Rail System / Direct Fix",
    warranty: "15 Years",
    certifications: ["ISO 14001", "PEFC", "EPD Verified"]
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Module-level components — defined OUTSIDE Configurator so React never
// unmounts/remounts them on parent re-renders. React.memo skips re-renders
// when props are shallowly equal.
// ─────────────────────────────────────────────────────────────────────────────

const TechSpecsPanel = memo(({ specs }) => (
  <div className="space-y-6" data-testid="tech-specs-panel">
    <div className="flex items-start gap-3">
      <div className="p-2 rounded-lg bg-red-50"><Flame className="h-5 w-5 text-red-500" /></div>
      <div>
        <h4 className="font-manrope font-bold text-sm">Fire Rating</h4>
        <p className="text-sm text-[hsl(215,16%,47%)]">{specs.fire_rating || "N/A"}</p>
      </div>
    </div>
    <div className="flex items-start gap-3">
      <div className="p-2 rounded-lg bg-blue-50">
        <svg className="h-5 w-5 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
          <path d="M12 6v6l4 2"/>
        </svg>
      </div>
      <div>
        <h4 className="font-manrope font-bold text-sm">NRC Rating</h4>
        <p className="text-sm text-[hsl(215,16%,47%)]">{specs.nrc_rating || "N/A"}</p>
      </div>
    </div>
    <div className="flex items-start gap-3">
      <div className="p-2 rounded-lg bg-gray-100">
        <svg className="h-5 w-5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <path d="M3 9h18M9 3v18"/>
        </svg>
      </div>
      <div>
        <h4 className="font-manrope font-bold text-sm">Material</h4>
        <p className="text-sm text-[hsl(215,16%,47%)]">{specs.material || "N/A"}</p>
      </div>
    </div>
    <div className="grid grid-cols-2 gap-4">
      <div className="p-3 rounded-lg bg-[hsl(var(--secondary))]">
        <p className="text-xs text-[hsl(215,16%,47%)]">Thickness</p>
        <p className="font-manrope font-bold text-sm">{specs.thickness_mm || "N/A"}</p>
      </div>
      <div className="p-3 rounded-lg bg-[hsl(var(--secondary))]">
        <p className="text-xs text-[hsl(215,16%,47%)]">Weight</p>
        <p className="font-manrope font-bold text-sm">{specs.weight_kg_m2 || "N/A"} kg/m²</p>
      </div>
    </div>
    <div className="flex items-start gap-3">
      <div className="p-2 rounded-lg bg-green-50"><Leaf className="h-5 w-5 text-green-500" /></div>
      <div className="flex-1">
        <h4 className="font-manrope font-bold text-sm">Sustainability</h4>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {(specs.sustainability || []).map((item, i) => (
            <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">{item}</span>
          ))}
        </div>
      </div>
    </div>
    <div className="flex items-start gap-3">
      <div className="p-2 rounded-lg bg-amber-50"><Award className="h-5 w-5 text-amber-500" /></div>
      <div className="flex-1">
        <h4 className="font-manrope font-bold text-sm">Certifications</h4>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {(specs.certifications || []).map((item, i) => (
            <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{item}</span>
          ))}
        </div>
      </div>
    </div>
    <div className="grid grid-cols-2 gap-4 pt-4 border-t">
      <div>
        <p className="text-xs text-[hsl(215,16%,47%)]">Installation</p>
        <p className="font-medium text-sm">{specs.installation || "N/A"}</p>
      </div>
      <div>
        <p className="text-xs text-[hsl(215,16%,47%)]">Warranty</p>
        <p className="font-medium text-sm">{specs.warranty || "N/A"}</p>
      </div>
    </div>
  </div>
));
TechSpecsPanel.displayName = "TechSpecsPanel";

// Maps raw vicstrip category/pattern names to display-friendly labels
const VICSTRIP_DISPLAY_LABEL = (name) => {
  if (!name) return name;
  const n = name.toLowerCase().replace(/[-_\s]+/g, ' ').trim();
  if (n === 'double groove') return 'Double Groove';
  if (n === 'single groove') return 'Single Groove';
  if (n === 'square') return 'Single Groove';
  if (n === 'double square') return 'Double Groove';
  return name;
};

const DesignThumbnail = memo(({ design, isSelected, onSelect }) => {
  const bgColor = design.texture_color || "#CCCCCC";
  const thumbUrl = resolveAssetUrl(design.thumbnail_url || design.texture_url || null);
  const isVicstrip = design.product_type === 'vicstrip';
  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <div
          className={`thumbnail-item ${isSelected ? "selected" : ""}`}
          style={{
            backgroundColor: bgColor,
            backgroundImage: thumbUrl ? `url("${thumbUrl}")` : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
          onClick={() => onSelect(design)}
          data-testid={`design-thumbnail-${design.id}`}
        />
      </HoverCardTrigger>
      <HoverCardContent side="right" align="start" className="w-72 p-0 overflow-hidden" data-testid={`design-hover-${design.id}`}>
        <div
          className="h-32 w-full"
          style={{
            backgroundColor: bgColor,
            backgroundImage: thumbUrl ? `url("${thumbUrl}")` : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="p-4 space-y-2">
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-[hsl(215,16%,47%)]">Product Code</span>
              <span className="font-mono font-medium">{design.design_code}</span>
            </div>
            {isVicstrip && design.color_name && (
              <div className="flex justify-between">
                <span className="text-[hsl(215,16%,47%)]">Color</span>
                <span className="font-medium">{design.color_name}</span>
              </div>
            )}
            {design.category && (
              <div className="flex justify-between">
                <span className="text-[hsl(215,16%,47%)]">Category</span>
                <span className="font-medium">{isVicstrip ? VICSTRIP_DISPLAY_LABEL(design.category) : design.category}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  await downloadPanelImages({ design, categoryId: design.category_id || (design.category && design.category.toLowerCase().replace(/ /g,'-')) });
                } catch (err) {
                  toast.error('Failed to download panel');
                }
              }}
              data-testid={`download-panel-btn-${design.id}`}
            >
              <Download className="h-4 w-4 mr-1" />
              Download Panel
            </Button>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
});
DesignThumbnail.displayName = "DesignThumbnail";

const EmbossThumbnail = memo(({ pattern, isSelected, onSelect, disabled }) => (
  <HoverCard openDelay={250} closeDelay={100}>
    <HoverCardTrigger asChild>
      <div
        className={`thumbnail-item emboss-thumbnail ${isSelected && !disabled ? "selected" : ""} ${disabled ? "disabled" : ""}`}
        style={{
          backgroundColor: "#E5E7EB",
          cursor: disabled ? "default" : "pointer",
          position: "relative",
        }}
        onClick={disabled ? undefined : () => onSelect(pattern)}
        data-testid={`emboss-thumbnail-${pattern.id}`}
      >
        {pattern.thumbnailUrl && (
          <img
            src={pattern.thumbnailUrl}
            alt={pattern.name}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        {disabled ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor: "rgba(0,0,0,0.52)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            <X className="h-4 w-4 text-white/70" />
          </div>
        ) : (
          <div className="emboss-thumbnail-label">
            {pattern.name}
          </div>
        )}
      </div>
    </HoverCardTrigger>
    <HoverCardContent side="right" align="start" className="w-52 p-0 overflow-hidden">
      {pattern.thumbnailUrl ? (
        <img src={pattern.thumbnailUrl} alt={pattern.name} className="w-full h-32 object-cover" />
      ) : (
        <div className="h-32 w-full bg-gray-100" />
      )}
      <div className="p-3">
        <p className="font-manrope font-bold text-sm">{pattern.name}</p>
      </div>
    </HoverCardContent>
  </HoverCard>
));
EmbossThumbnail.displayName = "EmbossThumbnail";

// ─── HDRI Lighting angle dial ─────────────────────────────────────────────────
// Standalone interactive SVG dial. Angle: 0° = top (12-o'clock), clockwise.
const LightingAngleDial = memo(({ angle, onChange, accentColor }) => {
  const dialRef = useRef(null);
  const draggingRef = useRef(false);
  const SIZE = 76;
  const CX = SIZE / 2;
  const RADIUS = 24;
  const color = accentColor || '#F59E0B';
  const rad = (angle * Math.PI) / 180;
  const indX = CX + Math.sin(rad) * RADIUS;
  const indY = CX - Math.cos(rad) * RADIUS;

  const getAngle = (e) => {
    const rect = dialRef.current.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    return ((90 + Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;
  };

  const handleMouseDown = (e) => {
    e.preventDefault();
    draggingRef.current = true;
    onChange(Math.round(getAngle(e)));
    const onMove = (ev) => { if (draggingRef.current) onChange(Math.round(getAngle(ev))); };
    const onUp = () => {
      draggingRef.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <svg
        ref={dialRef}
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        onMouseDown={handleMouseDown}
        style={{ cursor: 'crosshair', display: 'block', touchAction: 'none', userSelect: 'none' }}
        aria-label={`Light angle: ${Math.round(angle)} degrees`}
        role="slider"
        aria-valuenow={Math.round(angle)}
        aria-valuemin={0}
        aria-valuemax={359}
      >
        {/* Track ring */}
        <circle cx={CX} cy={CX} r={RADIUS} fill="none" stroke="#E2E8F0" strokeWidth={5} />
        {/* Cardinal tick marks (N/E/S/W) placed just outside the ring */}
        {[0, 90, 180, 270].map((a) => {
          const tr = (a * Math.PI) / 180;
          return (
            <line
              key={a}
              x1={CX + Math.sin(tr) * (RADIUS + 4)} y1={CX - Math.cos(tr) * (RADIUS + 4)}
              x2={CX + Math.sin(tr) * (RADIUS + 8)} y2={CX - Math.cos(tr) * (RADIUS + 8)}
              stroke="#CBD5E1" strokeWidth={1.5} strokeLinecap="round"
            />
          );
        })}
        {/* ↑ north label inside top */}
        <text x={CX} y={CX - RADIUS + 11} textAnchor="middle" fill="#94A3B8" fontSize={7} fontFamily="system-ui,sans-serif">↑</text>
        {/* Spoke from center to indicator */}
        <line x1={CX} y1={CX} x2={indX} y2={indY} stroke={color} strokeWidth={1.5} strokeLinecap="round" opacity={0.45} />
        {/* Center pivot dot */}
        <circle cx={CX} cy={CX} r={2.5} fill={color} opacity={0.35} />
        {/* Indicator dot — sits on the track ring */}
        <circle cx={indX} cy={indY} r={6} fill={color} opacity={0.92} />
        {/* Small highlight inside the indicator dot */}
        <circle cx={indX - Math.sin(rad) * 1.8} cy={indY + Math.cos(rad) * 1.8} r={2} fill="white" opacity={0.45} />
      </svg>
      <span style={{ fontSize: 9, color: '#94A3B8', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.04em' }}>
        {Math.round(angle)}°
      </span>
    </div>
  );
});
LightingAngleDial.displayName = 'LightingAngleDial';

// Maps public URL slugs to internal product IDs
const URL_SLUG_TO_PRODUCT_ID = {
  "bespoke-graphics": "flat-embossed-vmd",
};
const PRODUCT_ID_TO_URL_SLUG = Object.fromEntries(
  Object.entries(URL_SLUG_TO_PRODUCT_ID).map(([slug, id]) => [id, slug])
);

// ── New top-level taxonomy: Flat | Embossed | Grooving ───────────────────────
// Maps each surface type to the product-line IDs that belong there.
const SURFACE_SERIES_MAP = {
  flat:     ['flat-embossed-vmd', 'wood', 'fabrics'],
  embossed: ['flat-embossed-vmd', 'wood', 'fabrics', 'ombre'],
  grooving: ['ombre', 'vicstrip'],
};

// Returns the subset of categories valid for a given surface type + product.
// Pure function — safe to call inside handlers before state updates flush.
function getCategoriesForSurface(categories, surfaceType, productId) {
  if (!surfaceType || !categories?.length) return categories ?? [];
  if (surfaceType === 'flat') {
    if (productId === 'flat-embossed-vmd' || productId === 'wood')
      return categories.filter(c => !c.emboss_available || c.flat_available);
    return categories; // fabrics: all categories visible under Flat
  }
  if (surfaceType === 'embossed') {
    if (productId === 'flat-embossed-vmd' || productId === 'wood' || productId === 'fabrics')
      return categories.filter(c => c.emboss_available);
    return categories; // ombre: both sub-categories
  }
  if (surfaceType === 'grooving') {
    if (productId === 'ombre')
      return categories.filter(c => c.id === 'ombre-color-core-ombre');
    return categories; // vicstrip: no category-level filtering
  }
  return categories;
}

const Configurator = () => {
  const { productType: productTypeParam } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  // Products from API
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showBootOverlay, setShowBootOverlay] = useState(ENABLE_BOOT_WHITE_OVERLAY);
  const [chatOpen, setChatOpen] = useState(false);
  
  // Product type selection
  const [selectedProductType, setSelectedProductType] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  // Surface type: new top-level filter (Flat | Embossed | Grooving)
  const [selectedSurfaceType, setSelectedSurfaceType] = useState('flat');
  
  // Generic product state (for non-VicStrip products like VMD, Ombre)
  const [selectedDesign, setSelectedDesign] = useState(null);
  const [selectedSize, setSelectedSize] = useState(null);
  const [selectedDensity, setSelectedDensity] = useState(null);
  const [selectedPattern, setSelectedPattern] = useState(null);
  const [selectedColor, setSelectedColor] = useState(null);
  const [selectedThickness, setSelectedThickness] = useState(null);
  const [selectedEmbossPattern, setSelectedEmbossPattern] = useState(null);
  const [isEmbossed, setIsEmbossed] = useState(false);
  const [showTpatti, setShowTpatti] = useState(true);
  // Wood Perforations specific state
  const [selectedWoodPerfSize, setSelectedWoodPerfSize] = useState(null);
  const [selectedPerforation, setSelectedPerforation] = useState(null);
  // Color Core specific state
  const [selectedColorCoreColor, setSelectedColorCoreColor] = useState(null);
  const [selectedFabricStructure, setSelectedFabricStructure] = useState(null);
  const [selectedColorCoreEmboss, setSelectedColorCoreEmboss] = useState(null);
  // Designer Textile specific state
  const [selectedDTColorGroup, setSelectedDTColorGroup] = useState(null);
  const [selectedDTShade, setSelectedDTShade] = useState(null);
  const [selectedDTFabric, setSelectedDTFabric] = useState(null);
  const [selectedDTSize, setSelectedDTSize] = useState(null);
  const [selectedDTEmboss, setSelectedDTEmboss] = useState(null);
  // Ombre Color Core specific state
  const [selectedOmbreBaseColor, setSelectedOmbreBaseColor] = useState(null);
  const [selectedOmbreOverlay, setSelectedOmbreOverlay] = useState(null);
  const [selectedOmbreEmbossPattern, setSelectedOmbreEmbossPattern] = useState(null);
  const [selectedOmbreGroovePattern, setSelectedOmbreGroovePattern] = useState(null);
  const [ombreFinishType, setOmbreFinishType] = useState("emboss"); // "emboss" | "groove"
  // Signature Ombre real-time 3D configurator state
  const [soBaseColor, setSoBaseColor] = useState('#C47A4A');
  const [soOverlayColor, setSoOverlayColor] = useState('#6B3A2A');
  const [soBlend, setSoBlend] = useState(50);
  const [soLightRotation, setSoLightRotation] = useState(-10 * (Math.PI / 180)); // 10° CCW from Front
  const [soSelectedPattern, setSoSelectedPattern] = useState(SO_PATTERNS[0].id);
  const [soPanelImage, setSoPanelImage] = useState(null);
  const [soIsLoading, setSoIsLoading] = useState(false);
  const soEngineRef = useRef(null);
  const soDebounceRef = useRef(null);

  // UI state
  const [favorites, setFavorites] = useState([]);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [techSpecs, setTechSpecs] = useState(null);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const handleLoadingChange = useCallback((loading) => setIsImageLoading(loading), []);

  // ── Derived: series and categories filtered by selected surface type ─────
  const filteredSeries = useMemo(() => {
    const ids = SURFACE_SERIES_MAP[selectedSurfaceType] ?? [];
    return products.filter(p => p.active && ids.includes(p.id));
  }, [selectedSurfaceType, products]);

  const filteredCategories = useMemo(() =>
    getCategoriesForSurface(
      selectedProductType?.categories ?? [],
      selectedSurfaceType,
      selectedProductType?.id
    ),
    [selectedProductType, selectedSurfaceType]
  );

  const filteredDesigns = useMemo(() => {
    const designs = selectedCategory?.designs ?? [];
    if (selectedSurfaceType === 'embossed') {
      return designs.filter(d => d.available_emboss?.length > 0);
    }
    return designs;
  }, [selectedCategory, selectedSurfaceType]);

  // ── True when the user has filled all required sections (patti toggle is always optional) ──
  const isConfigComplete = useMemo(() => {
    if (!selectedProductType) return false;
    const id = selectedProductType.id;
    const needsSize  = (selectedProductType.sizes?.length ?? 0) > 0;
    const needsThick = (selectedProductType.thicknesses?.length ?? 0) > 0;

    if (id === "vicstrip") {
      return !!(selectedPattern && selectedDesign && selectedSize && selectedThickness);
    }

    if (id === "ombre") {
      if (!selectedCategory) return false;
      if (selectedCategory.id === "signature-ombre") {
        return !!((!needsThick || selectedThickness));
      }
      const base = !!(selectedOmbreBaseColor && selectedOmbreOverlay);
      return base && (!needsSize || !!selectedSize) && (!needsThick || !!selectedThickness);
    }

    if (id === "flat-embossed-vmd" || id === "wood") {
      if (!selectedCategory) return false;
      if (selectedCategory.id === "wood-perforations") {
        return !!(selectedWoodPerfSize && selectedDesign && (!needsThick || !!selectedThickness));
      }
      return !!(selectedDesign && (!needsSize || !!selectedSize) && (!needsThick || !!selectedThickness));
    }

    if (id === "fabrics") {
      if (!selectedCategory) return false;
      if (selectedCategory.id === "fabrics-color-core") {
        return !!(selectedColorCoreColor && selectedFabricStructure && !!selectedSize);
      }
      if (selectedCategory.id === "fabrics-designer-textile") {
        return !!(selectedDTShade && selectedDTFabric && selectedDTSize && selectedThickness);
      }
      return !!(selectedDesign && (!needsSize || !!selectedSize) && (!needsThick || !!selectedThickness));
    }

    // Generic fallback
    return !!(selectedCategory && selectedDesign &&
      (!needsSize || !!selectedSize) && (!needsThick || !!selectedThickness));
  }, [
    selectedProductType, selectedPattern, selectedDesign, selectedCategory,
    selectedSize, selectedThickness, selectedDTSize,
    selectedWoodPerfSize, selectedColorCoreColor, selectedFabricStructure,
    selectedDTShade, selectedDTFabric, selectedOmbreBaseColor, selectedOmbreOverlay,
  ]);

  // Designer Textile — Blob URL panel manager (exactly 1 full-res image in memory)
  // When an emboss pattern is selected, the pre-rendered emboss composite replaces the base panel.
  const isDTActive = selectedCategory?.id === "fabrics-designer-textile";
  const dtPanelUrl = isDTActive
    ? (selectedDTEmboss && selectedDTFabric?.id && selectedDTShade?.id
        ? getDesignerTextileEmbossUrl(selectedDTFabric.id, selectedDTEmboss.id, selectedDTShade.id, selectedDTEmboss.filenameSuffix)
        : (selectedDTFabric?.id && selectedDTShade?.id
            ? `${ASSETS_URL}/static/images/fabric/designer_textile/panels/${selectedDTFabric.id}_${selectedDTShade.id}.jpg`
            : null))
    : null;
  const { blobUrl: dtPanelBlobUrl, isLoading: dtPanelLoading } = useBlobPanel(dtPanelUrl);

  // Ombre — Blob URL panel manager (exactly 1 full-res image in memory)
  const isOmbreActive = selectedProductType?.id === "ombre";
  const ombrePanelUrl = isOmbreActive && selectedOmbreBaseColor && selectedOmbreOverlay
    ? getOmbreColorCorePanelUrl(selectedOmbreBaseColor.id, selectedOmbreOverlay.filename)
    : null;
  const { blobUrl: ombrePanelBlobUrl, isLoading: ombrePanelLoading } = useBlobPanel(ombrePanelUrl);

  // Color Core — Blob URL panel manager (exactly 1 full-res image in memory)
  const isCCActive = selectedCategory?.id === "fabrics-color-core";
  const ccPanelUrl = (isCCActive && selectedColorCoreColor && selectedFabricStructure)
    ? (selectedColorCoreEmboss
        ? getColorCoreEmbossUrl(
            selectedFabricStructure.id,
            selectedColorCoreEmboss.id,
            selectedColorCoreColor.id
          )
        : getColorCorePanelUrl(
            selectedFabricStructure.id,
            selectedColorCoreColor.id
          ))
    : null;
  const { blobUrl: ccPanelBlobUrl, isLoading: ccPanelLoading } = useBlobPanel(ccPanelUrl);

  // FVP single panel — flat-embossed, wood, non-CC/DT fabrics (non-continuous design)
  const fvpSingleUrl = (
    selectedProductType?.id !== "ombre" &&
    selectedProductType?.id !== "vicstrip" &&
    selectedCategory?.id !== "fabrics-color-core" &&
    selectedCategory?.id !== "fabrics-designer-textile" &&
    selectedDesign?.panel_variant !== "continuous"
  ) ? resolveAssetUrl(
      selectedDesign?.texture_url ||
      (selectedDesign?.design_code && selectedCategory?.id
        ? getFlatEmbossedPanelPath(selectedCategory.id, selectedDesign.design_code)
        : null)
    ) : null;
  const { blobUrl: fvpSingleBlobUrl, isLoading: fvpSingleLoading } = useBlobPanel(fvpSingleUrl);

  // FVP continuous panels — array of 3 slice URLs (e.g. marble)
  const fvpContinuousUrls = (
    selectedProductType?.id !== "ombre" &&
    selectedCategory?.id !== "fabrics-color-core" &&
    selectedCategory?.id !== "fabrics-designer-textile" &&
    selectedDesign?.panel_variant === "continuous" &&
    selectedDesign?.texture_urls?.length
  ) ? selectedDesign.texture_urls.map((u) => resolveAssetUrl(u)) : null;
  const { blobUrls: fvpContinuousBlobUrls, isLoading: fvpContinuousLoading } = useMultiBlobPanels(fvpContinuousUrls);

  // FVP emboss overlay (flat-embossed-vmt emboss patterns, not DT/wood-perf/ombre)
  const fvpEmbossUrl = (
    selectedEmbossPattern &&
    selectedDesign?.design_code &&
    selectedCategory?.id !== "fabrics-color-core" &&
    selectedCategory?.id !== "fabrics-designer-textile" &&
    selectedCategory?.id !== "wood-perforations" &&
    selectedProductType?.id !== "ombre"
  ) ? resolveAssetUrl(`/static/images/flat-embossed-vmt/emboss/${selectedDesign.design_code}/${selectedEmbossPattern.id}.png`)
    : null;
  const { blobUrl: fvpEmbossBlobUrl } = useBlobPanel(fvpEmbossUrl);

  // Wood perforation overlay
  const woodPerfEmbossUrl = selectedCategory?.id === "wood-perforations"
    ? (selectedPerforation?.url ?? null)
    : null;
  const { blobUrl: woodPerfEmbossBlobUrl } = useBlobPanel(woodPerfEmbossUrl);

  // Ombre emboss or groove overlay (mutually exclusive — emboss takes priority)
  const ombreEmbossUrl = isOmbreActive && selectedOmbreBaseColor && selectedOmbreOverlay
    ? selectedOmbreEmbossPattern
        ? getOmbreEmbossPanelUrl(selectedOmbreEmbossPattern, selectedOmbreOverlay.filename)
        : selectedOmbreGroovePattern
          ? getOmbreGroovePanelUrl(selectedOmbreGroovePattern, selectedOmbreOverlay.filename)
          : null
    : null;
  const { blobUrl: ombreEmbossBlobUrl } = useBlobPanel(ombreEmbossUrl);

  // VicStrip panel texture
  const vicstripUrl = (selectedProductType?.id === "vicstrip" && selectedPattern?.id && selectedDesign?.color?.id)
    ? getImagePath(selectedPattern.id, selectedDesign.color.id)
    : null;
  const { blobUrl: vicstripBlobUrl, isLoading: vicstripLoading } = useBlobPanel(vicstripUrl);

  // CanvasPreview texture (generic products not handled by specialised renderers)
  const isCanvasPreviewActive = (
    selectedProductType &&
    selectedProductType.id !== "flat-embossed-vmd" &&
    selectedProductType.id !== "wood" &&
    selectedProductType.id !== "fabrics" &&
    selectedProductType.id !== "ombre" &&
    selectedProductType.id !== "vicstrip"
  );
  const canvasPreviewUrl = isCanvasPreviewActive ? resolveAssetUrl(selectedDesign?.texture_url) : null;
  const { blobUrl: canvasBlobUrl } = useBlobPanel(canvasPreviewUrl);

  const canvasRef = useRef(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });
  const [hdriLighting, setHdriLighting] = useState('none'); // 'none' | 'warm' | 'soft'
  const [lightAngle, setLightAngle] = useState(40); // degrees: 0=top, 90=right, 180=bottom, 270=left
  const ZOOM_STEP = 0.50;
  const ZOOM_MIN = 1.0;
  const ZOOM_MAX = selectedProductType?.id === "ombre" ? 1.5 : 8.0;
  const zoomIn = () => setZoomLevel(prev => Math.min(parseFloat((prev + ZOOM_STEP).toFixed(2)), ZOOM_MAX));
  const zoomOut = () => setZoomLevel(prev => Math.max(parseFloat((prev - ZOOM_STEP).toFixed(2)), ZOOM_MIN));

  // Reset pan when zoom returns to 1
  useEffect(() => {
    if (zoomLevel === 1) setPanOffset({ x: 0, y: 0 });
  }, [zoomLevel]);

  const handlePanStart = useCallback((e) => {
    if (zoomLevel <= 1) return;
    isDraggingRef.current = true;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { x: panOffset.x, y: panOffset.y };
  }, [zoomLevel, panOffset]);

  const handlePanMove = useCallback((e) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPanOffset({ x: panStartRef.current.x + dx, y: panStartRef.current.y + dy });
  }, []);

  const handlePanEnd = useCallback(() => {
    isDraggingRef.current = false;
    setIsDragging(false);
  }, []);

  // ── Magnifier loupe ───────────────────────────────────────────────────────
  // Uses cloneNode(true) + CSS transform — fully synchronous, zero canvas rendering.
  // The clone is placed inside the circular lens div (overflow:hidden) and
  // repositioned on every mousemove via direct DOM style mutations (no React state).
  const magnifierRef = useRef(null);   // outer preview container
  const magnifierDivRef = useRef(null); // the lens circle (always in DOM)
  const lensCloneRef = useRef(null);    // cloned preview inside lens
  const [magnifierActive, setMagnifierActive] = useState(false);
  const MAGNIFIER_SIZE = 200;
  const MAGNIFIER_ZOOM = 2.5;

  const handleMagnifierEnter = useCallback(() => {
    if (!isConfigComplete || isDraggingRef.current) return;
    const node = magnifierRef.current;
    const lens = magnifierDivRef.current;
    if (!node || !lens) return;
    // Remove any stale clone
    while (lens.firstChild) lens.removeChild(lens.firstChild);
    // Deep-clone the preview node — synchronous, images already cached
    const clone = node.cloneNode(true);
    // Copy canvas pixel data — cloneNode creates blank canvases, so we manually
    // drawImage from each original canvas into its cloned counterpart.
    const origCanvases = Array.from(node.querySelectorAll('canvas'));
    const cloneCanvases = Array.from(clone.querySelectorAll('canvas'));
    origCanvases.forEach((orig, i) => {
      const dest = cloneCanvases[i];
      if (!dest) return;
      dest.width = orig.width;
      dest.height = orig.height;
      try {
        dest.getContext('2d')?.drawImage(orig, 0, 0);
      } catch (_) {}
    });
    clone.style.cssText = [
      'position:absolute',
      'top:0',
      'left:0',
      `width:${node.offsetWidth}px`,
      `height:${node.offsetHeight}px`,
      'pointer-events:none',
      'transform-origin:top left',
      `transform:scale(${MAGNIFIER_ZOOM})`,
    ].join(';');
    lens.appendChild(clone);
    lensCloneRef.current = clone;
    setMagnifierActive(true);
  }, [isConfigComplete]);

  // Clamp zoom when switching to ombre (which has a lower max)
  useEffect(() => {
    if (selectedProductType?.id === "ombre") {
      setZoomLevel(prev => Math.min(prev, 1.5));
    }
  }, [selectedProductType?.id]);

  // ── Signature Ombre engine lifecycle & rendering ───────────────────────────
  // Init engine + preload all OBJ models when Signature Ombre category is first selected
  useEffect(() => {
    if (selectedProductType?.id !== 'ombre' || selectedCategory?.id !== 'signature-ombre') return;
    if (soEngineRef.current) return; // already initialised
    const engine = new OmbreEmbossEngine();
    soEngineRef.current = engine;
    setSoIsLoading(true);
    engine.preloadAll(SO_PATTERNS).then(() => {
      setSoIsLoading(false);
    });
  }, [selectedProductType?.id, selectedCategory?.id]);

  // Dispose engine when user leaves the Ombre product entirely
  useEffect(() => {
    if (selectedProductType?.id === 'ombre') return;
    if (soEngineRef.current) {
      soEngineRef.current.dispose();
      soEngineRef.current = null;
      setSoPanelImage(null);
    }
  }, [selectedProductType?.id]);

  // Dispose on component unmount
  useEffect(() => {
    return () => {
      if (soEngineRef.current) { soEngineRef.current.dispose(); soEngineRef.current = null; }
      if (soDebounceRef.current) clearTimeout(soDebounceRef.current);
    };
  }, []);

  // Re-render panel whenever Signature Ombre config changes
  useEffect(() => {
    if (selectedProductType?.id !== 'ombre' || selectedCategory?.id !== 'signature-ombre') return;
    const engine = soEngineRef.current;
    if (!soSelectedPattern) {
      // No emboss selected — render a plain 2D ombre gradient (same as HTML prototype)
      const cv = document.createElement('canvas');
      cv.width = 512; cv.height = 1024;
      const ctx2 = cv.getContext('2d');
      const pct = Math.min(0.95, Math.max(0.05, soBlend / 100));
      const transStart = 1 - pct;
      const g = ctx2.createLinearGradient(0, 0, 0, cv.height);
      g.addColorStop(0, soBaseColor);
      g.addColorStop(transStart, soBaseColor);
      g.addColorStop(1, soOverlayColor);
      ctx2.fillStyle = g;
      ctx2.fillRect(0, 0, cv.width, cv.height);
      setSoPanelImage(cv.toDataURL('image/png'));
      return;
    }
    if (!engine || soIsLoading || !engine.isLoaded(soSelectedPattern)) return;
    if (soDebounceRef.current) clearTimeout(soDebounceRef.current);
    soDebounceRef.current = setTimeout(() => {
      try {
        const result = engine.render({
          baseColor: soBaseColor,
          overlayColor: soOverlayColor,
          ombrePercent: soBlend,
          patternId: soSelectedPattern,
          lightRotation: soLightRotation,
        });
        setSoPanelImage(result.dataUrl);
      } catch (err) {
        console.error('Signature Ombre render failed:', err);
      }
    }, 80);
  }, [soBaseColor, soOverlayColor, soBlend, soSelectedPattern, soLightRotation, soIsLoading, selectedProductType?.id, selectedCategory?.id]);

  // ── Render logging (remove when done profiling) ────────────────────────────
  useRenderLog("Configurator", {
    selectedProductType: selectedProductType?.id,
    selectedCategory: selectedCategory?.id,
    selectedDesign: selectedDesign?.id ?? selectedDesign?.name,
    selectedSize,
    selectedDensity,
    selectedPattern: selectedPattern?.id ?? selectedPattern?.name,
    selectedColor: selectedColor?.hex ?? selectedColor,
    selectedThickness,
    isEmbossed,
    showTpatti,
    loading,
    favoritesOpen,
  });

  // Load products from CDN JSON (replaces /api/products)
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        // const response = await axios.get(`${API}/products`);
        // const apiProducts = response.data;
        const response = await fetch(`${ASSETS_URL}/data/products.json`);
        const apiProducts = await response.json();
        setProducts(apiProducts);
        
        // Set default selection: use URL param if provided, else first active product
        const resolvedId = productTypeParam ? (URL_SLUG_TO_PRODUCT_ID[productTypeParam] || productTypeParam) : null;
        const urlProduct = resolvedId ? apiProducts.find(p => p.id === resolvedId && p.active) : null;
        const firstActive = urlProduct || apiProducts.find(p => p.active);
        if (firstActive) {
          setSelectedProductType(firstActive);
          // Nothing else pre-filled — user selects everything from scratch.
          if (firstActive.id === "ombre") {
            // Keep finish-type state consistent; no visible selections yet
            setSelectedOmbreEmbossPattern(null);
            setSelectedOmbreGroovePattern(null);
            setOmbreFinishType("emboss");
          }
        }
        setLoading(false);
      } catch (error) {
        console.error("Failed to fetch products:", error);
        toast.error("Failed to load products");
        setLoading(false);
      }
    };
    fetchProducts();
  }, []);

  useEffect(() => {
    if (!ENABLE_BOOT_WHITE_OVERLAY) {
      setShowBootOverlay(false);
      return;
    }

    if (loading) {
      setShowBootOverlay(true);
      return;
    }

    const timer = setTimeout(() => {
      setShowBootOverlay(false);
    }, BOOT_OVERLAY_EXTRA_MS);

    return () => clearTimeout(timer);
  }, [loading]);

  // Load tech specs from CDN JSON (replaces /api/products/{id}/specs)
  // Handle surfaceType hint from chat widget navigation state
  useEffect(() => {
    const st = location.state?.surfaceType;
    if (!st || loading) return;
    handleSurfaceTypeChange(st);
    // Clear the state so re-renders don't re-fire this
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state?.surfaceType, loading]);

  useEffect(() => {
    const fetchSpecs = async () => {
      if (selectedProductType?.id) {
        try {
          // const response = await axios.get(`${API}/products/${selectedProductType.id}/specs`);
          // setTechSpecs(response.data);
          const response = await fetch(`${ASSETS_URL}/data/tech-specs.json`);
          const allSpecs = await response.json();
          setTechSpecs(allSpecs[selectedProductType.id] || {});
        } catch (error) {
          setTechSpecs(DEFAULT_SPECS[selectedProductType.id] || null);
        }
      }
    };
    fetchSpecs();
  }, [selectedProductType]);

  // Debug: API fetch timing
  // (render-level state diffs are now handled by useRenderLog above)

  // Load favorites from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("univicoustic_favorites");
    if (saved) {
      setFavorites(JSON.parse(saved));
    }
  }, []);

  // Save favorites to localStorage
  const saveFavorites = useCallback((newFavorites) => {
    localStorage.setItem("univicoustic_favorites", JSON.stringify(newFavorites));
    setFavorites(newFavorites);
  }, []);

  // Handle product type change
  // handleProductTypeChange accepts an optional overrideSurfaceType so it can
  // be called before React flushes the setSelectedSurfaceType update (e.g. from
  // handleSurfaceTypeChange). Falls back to the current selectedSurfaceType.
  const handleProductTypeChange = (productId, overrideSurfaceType) => {
    const product = products.find(p => p.id === productId);
    if (product && product.active) {
      navigate('/' + (PRODUCT_ID_TO_URL_SLUG[productId] || productId));
      setSelectedProductType(product);
      
      // Clear all state first
      setPanOffset({ x: 0, y: 0 });
      setSelectedCategory(null);
      setSelectedDesign(null);
      setIsEmbossed(false);
      setSelectedPattern(null);
      setSelectedColor(null);
      setSelectedDensity(null);
      setSelectedSize(null);
      setSelectedThickness(null);
      setSelectedEmbossPattern(null);
      setSelectedWoodPerfSize(null);
      setSelectedPerforation(null);
      setSelectedColorCoreEmboss(null);
      setSelectedColorCoreColor(null);
      setSelectedFabricStructure(null);
      setSelectedDTColorGroup(null);
      setSelectedDTShade(null);
      setSelectedDTFabric(null);
      setSelectedDTSize(null);
      setSelectedDTEmboss(null);
      setSelectedOmbreBaseColor(null);
      setSelectedOmbreOverlay(null);
      setSelectedOmbreEmbossPattern(null);
      setSelectedOmbreGroovePattern(null);
      setOmbreFinishType("emboss");
      
      // Nothing pre-filled on product type change — user selects everything from scratch.
      if (product.id === "ombre") {
        // Keep finish-type state consistent; no visible selections yet
        setSelectedOmbreEmbossPattern(null);
        setSelectedOmbreGroovePattern(null);
        const st = overrideSurfaceType ?? selectedSurfaceType;
        setOmbreFinishType(st === 'grooving' ? 'groove' : 'emboss');
      }
    }
  };

  // Handle category change (for non-VicStrip products)
  const handleCategoryChange = (categoryId) => {
    const category = selectedProductType?.categories?.find(c => c.id === categoryId);
    if (category) {
      setSelectedCategory(category);
      setIsEmbossed(false);
      setSelectedEmbossPattern(null);
      // Wood Perforations: auto-select first size, first print (design), and first pattern
      if (category.id === "wood-perforations") {
        const defaultSize = WOOD_PERFORATION_SIZES[0].id;
        const exclusions = WOOD_PERFORATION_EXCLUSIONS[defaultSize] || [];
        const defaultPattern = WOOD_PERFORATION_PATTERNS.find(p => !exclusions.includes(p.id));
        setSelectedDesign(category.designs?.[0] || null);
        setSelectedWoodPerfSize(defaultSize);
        setSelectedPerforation(defaultPattern || null);
      } else if (category.id === "fabrics-color-core") {
        // Color Core: clear all selections — user picks from scratch
        setSelectedColorCoreColor(null);
        setSelectedFabricStructure(null);
        setSelectedColorCoreEmboss(null);
        setSelectedSize(null);
        setSelectedDesign(null);
      } else if (category.id === "fabrics-designer-textile") {
        // Designer Textile: auto-select first color + first compatible fabric so textures are immediately visible
        const firstGroup = DESIGNER_TEXTILE_COLOR_GROUPS[0];
        const firstShade = firstGroup?.shades?.[0] ?? null;
        const firstFabric = firstGroup
          ? (DESIGNER_TEXTILE_FABRICS.find(f => f.supportedColorGroups.includes(firstGroup.id)) ?? DESIGNER_TEXTILE_FABRICS[0])
          : null;
        setSelectedDTColorGroup(firstGroup ?? null);
        setSelectedDTShade(firstShade);
        setSelectedDTFabric(firstFabric);
        setSelectedDTSize(null);
        setSelectedDTEmboss(null);
        setSelectedThickness(null);
        setSelectedDesign(null);
      } else if (category.id === "ombre-color-core-ombre") {
        // Ombre Color Core: clear all selections — user picks from scratch
        setSelectedOmbreBaseColor(null);
        setSelectedOmbreOverlay(null);
        setSelectedOmbreEmbossPattern(null);
        setSelectedOmbreGroovePattern(null);
        // Force groove when the user has selected the Grooving surface type
        setOmbreFinishType(selectedSurfaceType === 'grooving' ? 'groove' : 'emboss');
        setSelectedDesign(null);
      } else if (category.id === "signature-ombre") {
        // Signature Ombre: reset to defaults; engine inits via useEffect
        setSoPanelImage(null);
        setSoBaseColor('#C47A4A');
        setSoOverlayColor('#6B3A2A');
        setSoBlend(50);
        setSoLightRotation(-60 * (Math.PI / 180)); // 60° CCW from Front
        setSoSelectedPattern(SO_PATTERNS[0].id);
        setSelectedDesign(null);
        setSelectedThickness(selectedProductType?.thicknesses?.[0] || null);
      } else if (category.designs?.length > 0) {
        setSelectedDesign(category.designs[0]);
      } else {
        setSelectedDesign(null);
      }
    }
  };

  // VicStrip: handle size change — resets pattern to first available for new size
  const handleVicstripSizeChange = (size) => {
    setSelectedSize(size);
    const firstForSize = VICSTRIP_PRODUCT.patterns.find(p => p.sizes.includes(size));
    if (firstForSize) {
      setSelectedPattern(firstForSize);
      setSelectedDesign({ pattern: firstForSize, color: firstForSize.colors[0] });
      setSelectedCategory(null);
    }
  };

  // Preload + async-decode vicstrip thumbnail images when pattern/category changes
  useEffect(() => {
    if (selectedProductType?.id !== "vicstrip") return;
    const urls = [];
    const apiCategory = selectedProductType?.categories?.find(c => c.id === `vicstrip-${selectedPattern?.id}`);
    if (apiCategory?.designs?.length > 0) {
      apiCategory.designs.forEach((d) => {
        const url = getVicstripThumbnailUrl(selectedPattern?.id, d.design_code);
        if (url) urls.push(url);
      });
    } else if (selectedPattern) {
      const pid = selectedPattern.id || selectedPattern.name;
      (selectedPattern.colors || []).forEach((c, i) => {
        const code = `VCS-${(i + 1).toString().padStart(4, '0')}`;
        const url = getVicstripThumbnailUrl(pid, code);
        if (url) urls.push(url);
      });
    }

    urls.forEach((u) => {
      const img = new Image();
      img.decoding = 'async';
      img.src = u;
      if (img.decode) img.decode().catch(() => {});
    });
  }, [selectedProductType?.id, selectedProductType?.categories, selectedPattern?.id, selectedSize]);

  // VicStrip: handle pattern change
  const handlePatternChange = (patternId) => {
    const pattern = VICSTRIP_PRODUCT.patterns.find(p => p.id === patternId);
    if (pattern) {
      setSelectedPattern(pattern);
      setSelectedDesign({ pattern, color: pattern.colors[0] });
      // clear category when switching patterns
      setSelectedCategory(null);
    }
  };

  // Handle design selection (accept design object or color id for VicStrip)
  const handleDesignSelect = (designOrColor) => {
    if (!designOrColor) return;
    if (selectedProductType?.id === "vicstrip") {
      // VicStrip flow
      if (typeof designOrColor === 'object' && designOrColor.color) {
        setSelectedDesign(designOrColor);
      } else if (typeof designOrColor === 'object' && designOrColor.id) {
        const color = selectedPattern?.colors?.find(c => c.id === designOrColor.color?.id);
        if (color) setSelectedDesign({ pattern: selectedPattern, color });
      } else {
        const color = selectedPattern?.colors?.find(c => c.id === designOrColor);
        if (color) setSelectedDesign({ pattern: selectedPattern, color });
      }
    } else {
      // Generic product flow (VMD, Ombre, etc.)
      if (selectedDesign?.id !== designOrColor?.id) {
        setSelectedEmbossPattern(null);
      }
      setSelectedDesign(designOrColor);
    }
  };

  // Handle ombre size change — force groove when 1200x2400 is selected
  const handleOmbreSizeChange = useCallback((size) => {
    setSelectedSize(size);
    if (size === "1200x2400") {
      setOmbreFinishType("groove");
      setSelectedOmbreEmbossPattern(null);
    }
  }, []);

  // Toggle emboss pattern selection (clicking the selected pattern deselects it)
  const handleEmbossPatternSelect = (pattern) => {
    setSelectedEmbossPattern(prev => {
      const isDeselecting = prev?.id === pattern.id;
      if (!isDeselecting) setShowTpatti(false);
      return isDeselecting ? null : pattern;
    });
  };

  // (groove thumbnails now served via /thumb/ — no eager preload needed)

  // Reset emboss selection if the current pattern is not available for the new size
  // (placed here so it's defined before the JSX; effect runs after state change)

  // Save current configuration to favorites
  const saveToFavorites = () => {
    if (!selectedDesign) {
      toast.error("Please select a design first");
      return;
    }

    const config = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      productType: selectedProductType?.name,
      productTypeId: selectedProductType?.id,
      
      // VicStrip specific
      ...(selectedProductType?.id === "vicstrip" && {
        pattern: selectedDesign.pattern,
        color: selectedDesign.color,
      }),
      
      // Generic product specific
      ...(selectedProductType?.id !== "vicstrip" && {
        category: selectedCategory?.name,
        categoryId: selectedCategory?.id,
        design: selectedDesign,
        density: selectedDensity,
        pattern: selectedPattern,
        color: selectedColor,
        isEmbossed: isEmbossed,
        embossPattern: (selectedProductType?.id === "flat-embossed-vmd" || selectedProductType?.id === "wood" || selectedProductType?.id === "fabrics") ? selectedEmbossPattern : null,
      }),
      
      // Common
      size: selectedSize,
      thickness: selectedThickness,
    };

    const newFavorites = [...favorites, config];
    saveFavorites(newFavorites);
    toast.success("Configuration saved!");
  };

  // Load favorite configuration
  const loadFavorite = (favorite) => {
    const product = products.find(p => p.id === favorite.productTypeId);
    if (product) {
      setSelectedProductType(product);
      
      if (favorite.productTypeId === "vicstrip") {
        // VicStrip flow
        const pattern = VICSTRIP_PRODUCT.patterns.find(p => p.id === favorite.pattern.id);
        if (pattern) {
          setSelectedPattern(pattern);
          const color = pattern.colors.find(c => c.id === favorite.color.id);
          if (color) {
            setSelectedDesign({ pattern, color });
          }
        }
        setSelectedSize(favorite.size || "600x600");
        setSelectedThickness(favorite.thickness || "12mm (PET Panel)");
      } else {
        // Generic product flow
        const category = product.categories?.find(c => c.id === favorite.categoryId);
        if (category) {
          setSelectedCategory(category);
          setSelectedDesign(favorite.design);
        }
        setSelectedSize(favorite.size);
        setSelectedDensity(favorite.density);
        setSelectedPattern(favorite.pattern);
        setSelectedColor(favorite.color);
        setSelectedThickness(favorite.thickness);
        setIsEmbossed(favorite.isEmbossed);
        if (favorite.embossPattern) setSelectedEmbossPattern(favorite.embossPattern);
      }
    }
    setFavoritesOpen(false);
    toast.success("Configuration loaded!");
  };

  // Delete favorite
  const deleteFavorite = (favoriteId, e) => {
    e.stopPropagation();
    const newFavorites = favorites.filter(f => f.id !== favoriteId);
    saveFavorites(newFavorites);
    toast.success("Favorite removed");
  };

  // Download rendered image
  const downloadImage = () => {
    // Signature Ombre: composite wall canvas + room overlay
    if (selectedProductType?.id === 'ombre' && selectedCategory?.id === 'signature-ombre') {
      const wallCanvas = document.querySelector('.so-room canvas');
      const overlayImg = document.querySelector('.so-room img');
      if (!wallCanvas) return;
      const out = document.createElement('canvas'); out.width = 2000; out.height = 2000;
      const ctx = out.getContext('2d');
      ctx.drawImage(wallCanvas, 0, 0, 2000, 2000);
      if (overlayImg?.complete && overlayImg.naturalWidth) ctx.drawImage(overlayImg, 0, 0, 2000, 2000);
      const url = out.toDataURL('image/png');
      const a = document.createElement('a'); a.href = url;
      a.download = `SignatureOmbre_${soSelectedPattern}_${soBaseColor.replace('#', '')}_${soOverlayColor.replace('#', '')}.png`;
      a.click();
      return;
    }
    if (canvasRef.current) {
      canvasRef.current.downloadImage();
    }
  };

  // Reset configuration
  const resetConfig = () => {
    if (selectedProductType) {
      handleProductTypeChange(selectedProductType.id);
      toast.success("Configuration reset");
    }
  };

  // Handle surface type change (Flat / Embossed / Grooving)
  // Selects the first available series for the new surface type and resets downstream state.
  // If the current product type is also valid for the new surface, stays on it and
  // preserves the selected category when it's valid for the new surface too.
  const handleSurfaceTypeChange = (surfaceType) => {
    if (surfaceType === selectedSurfaceType) return;
    const prevCategory = selectedCategory;
    const prevProductId = selectedProductType?.id;
    setSelectedSurfaceType(surfaceType);
    const ids = SURFACE_SERIES_MAP[surfaceType] ?? [];
    // Stay on current series if it exists in the new surface, otherwise jump to first
    const targetId = (prevProductId && ids.includes(prevProductId))
      ? prevProductId
      : products.find(p => p.active && ids.includes(p.id))?.id;
    if (targetId) {
      handleProductTypeChange(targetId, surfaceType);
      // Restore category if it's valid for the new surface type
      if (prevCategory && targetId === prevProductId) {
        const targetProduct = products.find(p => p.id === targetId);
        const validCats = getCategoriesForSurface(targetProduct?.categories ?? [], surfaceType, targetId);
        if (validCats.some(c => c.id === prevCategory.id)) {
          setSelectedCategory(prevCategory);
        }
      }
    }
  };

  // Technical Specs Panel — defined outside Configurator (see below)
  // Using the module-level TechSpecsPanel component with specs passed as a prop.

  // ── placeholder so JSX below still works ──────────────────────────────────
  const techSpecsData = techSpecs || DEFAULT_SPECS[selectedProductType?.id] || {};

  if (!ENABLE_BOOT_WHITE_OVERLAY && loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <img src="/UV-loader.png" alt="Loading..." className="uv-loader" />
      </div>
    );
  }

  return (
    <div className="configurator-root" data-testid="configurator-page">
      {/* Mobile block screen */}
      <div className="md:hidden fixed inset-0 z-[999] bg-white flex flex-col items-center justify-center gap-4 p-8 text-center">
        <img src="/univicoustic-logo.png" alt="UniVicoustic" className="h-12 w-auto object-contain mb-2" />
        <p className="text-[hsl(215,25%,27%)] font-semibold text-lg leading-snug">
          Please open on a larger screen
        </p>
        <p className="text-[hsl(215,16%,50%)] text-sm leading-relaxed max-w-xs">
          The UniVicoustic configurator is designed for desktop use. For the best experience, open this on a laptop or desktop browser.
        </p>
      </div>

      {/* Full-page loading overlay — blocks all interaction while preview image is changing */}
      {(isImageLoading || dtPanelLoading || ccPanelLoading || ombrePanelLoading || fvpSingleLoading || fvpContinuousLoading || vicstripLoading) && (
        <div
          className="fixed inset-0 z-[200] cursor-not-allowed"
          aria-hidden="true"
        />
      )}

      {/* ── TOP HEADER BAR ───────────────────────────────────────────────── */}
      <header className="app-header" data-testid="app-header">
        <div className="flex items-center gap-3">
          <img
            src="/univicoustic-logo.png"
            alt="UniVicoustic"
            className="h-10 w-auto object-contain"
            data-testid="brand-logo"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={saveToFavorites}
            className="text-[hsl(215,25%,27%)] border-[hsl(var(--border))]"
            data-testid="save-favorite-btn"
          >
            <Heart className="h-4 w-4 mr-1.5" />
            Save
          </Button>
          <Button
            size="sm"
            onClick={downloadImage}
            className="bg-[hsl(25,40%,46%)] hover:bg-[hsl(25,40%,40%)] text-white"
            data-testid="download-btn"
          >
            <Download className="h-4 w-4 mr-1.5" />
            Download
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const productId = selectedProductType?.id;
              const catId = selectedCategory?.id;

              // Products where thickness determines which PDF to show
              const needsThickness = (
                productId === "flat-embossed-vmd" ||
                productId === "wood" ||
                (productId === "fabrics" && catId !== "fabrics-color-core") ||
                (productId === "ombre" && catId === "signature-ombre")
              );

              if (needsThickness && !selectedThickness) {
                toast.error("Please select a thickness first");
                return;
              }

              const isPetWool = selectedThickness?.includes("PET Wool");
              const isEmbossedSurface = selectedSurfaceType === 'embossed';

              let pdfFile;
              if (productId === "flat-embossed-vmd") {
                pdfFile = isEmbossedSurface
                  ? (isPetWool ? "Embossed VMT Series (PET WOOL).pdf" : "Embossed VMT Series (PET).pdf")
                  : (isPetWool ? "Flat Panel VMT (PET WOOL).pdf" : "Flat Panel VMT (PET).pdf");
              } else if (productId === "wood") {
                if (catId === "wood-classic-parquet") {
                  pdfFile = isPetWool ? "Flat Panel VMT (PET WOOL).pdf" : "Flat Panel VMT (PET).pdf";
                } else {
                  pdfFile = isEmbossedSurface
                    ? (isPetWool ? "Embossed VMT Series (PET WOOL).pdf" : "Embossed VMT Series (PET).pdf")
                    : (isPetWool ? "Flat Panel VMT (PET WOOL).pdf" : "Flat Panel VMT (PET).pdf");
                }
              } else if (productId === "fabrics") {
                if (catId === "fabrics-color-core") {
                  // Color Core has no PET Wool option
                  pdfFile = isEmbossedSurface ? "Embossed VMT Series (PET).pdf" : "Flat Panel VMT (PET).pdf";
                } else {
                  // designer-textile, luxury-textures, modern-corporate
                  pdfFile = isEmbossedSurface
                    ? (isPetWool ? "Embossed VMT Series (PET WOOL).pdf" : "Embossed VMT Series (PET).pdf")
                    : (isPetWool ? "Flat Panel VMT (PET WOOL).pdf" : "Flat Panel VMT (PET).pdf");
                }
              } else if (productId === "ombre") {
                if (catId === "ombre-color-core-ombre") {
                  // Color Core Ombre has no PET Wool; grooving tab → flat PDF
                  pdfFile = selectedSurfaceType === 'embossed'
                    ? "Embossed VMT Series (PET).pdf"
                    : "Flat Panel VMT (PET).pdf";
                } else {
                  // Signature Ombre — always embossed
                  pdfFile = isPetWool ? "Embossed VMT Series (PET WOOL).pdf" : "Embossed VMT Series (PET).pdf";
                }
              } else if (productId === "vicstrip") {
                pdfFile = "Flat Panel VMT (PET).pdf";
              } else {
                pdfFile = isPetWool ? "Flat Panel VMT (PET WOOL).pdf" : "Flat Panel VMT (PET).pdf";
              }
              window.open(`${ASSETS_URL}/static/technical_specification_pdfs/${encodeURIComponent(pdfFile)}`, "_blank");
            }}
            className="text-[hsl(215,25%,27%)]"
            data-testid="tech-spec-btn"
          >
            <FileText className="h-4 w-4 mr-1.5" />
            View Tech Specs
          </Button>
        </div>
      </header>

      {/* ── CONTENT ROW (sidebar + preview) ─────────────────────────────── */}
      <div className="configurator-content">
      {/* Sidebar */}
      <aside className="config-sidebar" data-testid="config-sidebar">
        <ScrollArea className="flex-1 min-h-0">
          <div className="flex flex-col" data-testid="config-options">
            {/* Product Type — Flat | Embossed | Grooving */}
            <div className="config-section space-y-2">
              <Label className="section-header">Product Type</Label>
              <div className="flex rounded-md overflow-hidden border border-[hsl(var(--border))]">
                {[
                  { id: 'flat', label: 'Flat' },
                  { id: 'embossed', label: 'Embossed' },
                  { id: 'grooving', label: 'Grooving' },
                ].map((st, idx, arr) => (
                  <button
                    key={st.id}
                    onClick={() => handleSurfaceTypeChange(st.id)}
                    className={`flex-1 py-2 text-sm font-medium transition-colors ${idx < arr.length - 1 ? 'border-r border-[hsl(var(--border))]' : ''} ${
                      selectedSurfaceType === st.id
                        ? 'bg-[hsl(30,40%,46%)] text-white'
                        : 'bg-[hsl(var(--background))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]'
                    }`}
                    data-testid={`surface-type-${st.id}`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Series — filtered by surface type */}
            {filteredSeries.length > 0 && (
              <div className="config-section space-y-2">
                <Label className="section-header">Series</Label>
                <Select value={selectedProductType?.id ?? ''} onValueChange={handleProductTypeChange}>
                  <SelectTrigger className="w-full" data-testid="series-trigger">
                    <SelectValue placeholder="Select series" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredSeries.map((product) => (
                      <SelectItem key={product.id} value={product.id} data-testid={`series-${product.id}`}>
                        {product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* VicStrip Options */}
            {selectedProductType?.id === "vicstrip" && (
              <div className="flex flex-col">
                {/* Pattern Selection */}
                <div className="config-section space-y-2">
                  <Label className="section-header">Pattern</Label>
                  <Select value={selectedPattern?.id} onValueChange={handlePatternChange}>
                    <SelectTrigger className="w-full" data-testid="pattern-trigger">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VICSTRIP_PRODUCT.patterns.filter(p => p.sizes.includes(selectedSize || "600x600")).map((pattern) => (
                        <SelectItem key={pattern.id} value={pattern.id} data-testid={`pattern-${pattern.id}`}>
                          {pattern.id === 'square' ? 'Single Groove' : pattern.id === 'double-square' ? 'Double Groove' : pattern.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Options Section (Size, Thickness) */}
                <div className="config-section space-y-2">
                  <Label className="section-header">Options</Label>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <Label className="text-xs">Size</Label>
                      <Select value={selectedSize || ""} onValueChange={handleVicstripSizeChange}>
                        <SelectTrigger className="w-full" data-testid="size-trigger">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="600x600">600x600</SelectItem>
                          <SelectItem value="600x2400">600x2400</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1">
                      <Label className="text-xs">Thickness</Label>
                      <Select value={selectedThickness || ""} onValueChange={setSelectedThickness}>
                        <SelectTrigger className="w-full" data-testid="thickness-trigger">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="12mm (PET Panel)">12mm (PET Panel)</SelectItem>
                          <SelectItem value="25mm (PET Panel)">25mm (PET Panel)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Designs Section (all colors as designs) */}
                <div className="config-section space-y-2">
                  <Label className="section-header">Designs</Label>
                  <div className="thumbnail-grid" data-testid="design-grid">
                      {(() => {
                        // Use the API category order from products.json for this pattern
                        const apiCategory = selectedProductType?.categories?.find(c => c.id === `vicstrip-${selectedPattern?.id}`);
                        const patternColors = selectedPattern?.colors || [];
                        const designs = (apiCategory?.designs?.length > 0)
                          ? apiCategory.designs.map((d) => {
                              const colorIdx = parseInt((d.design_code || '').replace('VCS-', ''), 10) - 1;
                              const color = patternColors[colorIdx] || patternColors.find(c => c.name === d.color_name) || null;
                              return {
                                id: `vicstrip-color-${color?.id || d.id}`,
                                product_type: 'vicstrip',
                                category: selectedPattern?.name,
                                design_code: d.design_code,
                                design_name: d.design_name,
                                texture_color: color?.hex || d.texture_color || d.color,
                                thumbnail_url: d.thumbnail_url || getVicstripThumbnailUrl(selectedPattern?.id, d.design_code),
                                color_name: color?.name || d.color_name,
                                pattern: selectedPattern?.name,
                                color: color,
                              };
                            })
                          : patternColors.map((c, i) => ({
                              id: `vicstrip-color-${c.id || i}`,
                              product_type: 'vicstrip',
                              category: selectedPattern?.name,
                              design_code: `VCS-${(i+1).toString().padStart(4,'0')}`,
                              design_name: `${selectedPattern?.name} - ${c.name}`,
                              texture_color: c.hex,
                              thumbnail_url: getVicstripThumbnailUrl(selectedPattern?.id || selectedPattern?.name, `VCS-${(i+1).toString().padStart(4,'0')}`),
                              color_name: c.name,
                              pattern: selectedPattern?.name,
                              color: c,
                            }));

                        return designs.map((design) => (
                          <DesignThumbnail
                            key={design.id}
                            design={design}
                            isSelected={selectedDesign?.id === design.id || selectedDesign?.color?.hex === design.texture_color}
                            onSelect={handleDesignSelect}
                          />
                        ));
                      })()}
                    </div>
                  {selectedDesign && (
                    <div className="p-3 bg-[hsl(var(--secondary))] rounded-lg mt-2">
                      <p className="font-medium text-sm">{selectedDesign.color.name}</p>
                      <p className="text-xs text-[hsl(215,16%,47%)]">{selectedDesign.color.hex}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Flat Embossed VMT Options */}
            {(selectedProductType?.id === "flat-embossed-vmd" || selectedProductType?.id === "wood" || selectedProductType?.id === "fabrics") && (
              <div className="flex flex-col">
                {/* 1. Category — filtered by surface type; shown first so size/thickness can be category-aware */}
                {filteredCategories.length > 0 && (
                  <div className="config-section space-y-2">
                    <Label className="section-header">Category</Label>
                    <Select value={selectedCategory?.id} onValueChange={handleCategoryChange} data-testid="category-select">
                      <SelectTrigger className="w-full" data-testid="category-trigger">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredCategories.map((category) => (
                          <SelectItem key={category.id} value={category.id} data-testid={`category-${category.id}`}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {/* T-Patti toggle */}
                    {selectedCategory?.id && FLAT_EMBOSSED_VMT_CONFIG[selectedCategory.id]?.tpatti && (
                      <div className="flex items-center justify-between mt-3 p-3 bg-[hsl(var(--secondary))] rounded-lg">
                        <Label htmlFor="tpatti-toggle" className="text-sm font-medium">T-Profile Overlay</Label>
                        <Switch id="tpatti-toggle" checked={showTpatti} onCheckedChange={setShowTpatti} data-testid="tpatti-toggle" />
                      </div>
                    )}
                  </div>
                )}

                {/* 2. Size — only shown after a category is selected */}
                {selectedCategory && selectedProductType?.sizes?.length > 0 && selectedCategory?.id !== "wood-perforations" && selectedCategory?.id !== "fabrics-color-core" && selectedCategory?.id !== "fabrics-designer-textile" && (
                  <div className="config-section space-y-2">
                    <Label className="section-header">Size</Label>
                    <Select value={selectedSize || ""} onValueChange={setSelectedSize} data-testid="size-select">
                      <SelectTrigger className="w-full" data-testid="size-trigger">
                        <SelectValue placeholder="Select size" />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedProductType.sizes.map((size) => (
                          <SelectItem key={size} value={size} data-testid={`size-${size}`}>{size}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* 3. Thickness — only shown after a category is selected */}
                {selectedCategory && selectedProductType?.thicknesses?.length > 0 && selectedCategory?.id !== "fabrics-designer-textile" && (
                  <div className="config-section space-y-2">
                    <Label className="section-header">Thickness</Label>
                    <Select value={selectedThickness || ""} onValueChange={setSelectedThickness} data-testid="thickness-select">
                      <SelectTrigger className="w-full" data-testid="thickness-trigger">
                        <SelectValue placeholder="Select thickness" />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedProductType.thicknesses.map((thickness) => {
                          const nrcHint = selectedProductType.id === "flat-embossed-vmd"
                            ? THICKNESS_NRC_HINTS[thickness]
                            : null;
                          return nrcHint ? (
                            <Tooltip key={thickness}>
                              <TooltipTrigger asChild>
                                <SelectItem value={thickness} data-testid={`thickness-${thickness}`}>
                                  {thickness}
                                </SelectItem>
                              </TooltipTrigger>
                              <TooltipContent side="right" className="max-w-[220px] text-center">
                                {nrcHint}
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <SelectItem key={thickness} value={thickness} data-testid={`thickness-${thickness}`}>
                              {thickness}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* 4. Size — only for Wood Perforations (category-level, gates the print grid) */}
                {selectedCategory?.id === "wood-perforations" && (
                  <div className="config-section space-y-2">
                    <Label className="section-header">Size</Label>
                    <Select value={selectedWoodPerfSize || ""} onValueChange={(v) => { setSelectedWoodPerfSize(v); setSelectedPerforation(null); }} data-testid="wood-perf-size-select">
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select size" />
                      </SelectTrigger>
                      <SelectContent>
                        {WOOD_PERFORATION_SIZES.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* 3. Print / Designer Textile Sections */}
                {selectedCategory?.id === "fabrics-color-core" ? (
                  <>

                    {/* Color Core: Size */}
                    <div className="config-section space-y-2">
                      <Label className="section-header">Size</Label>
                      <Select value={selectedSize || ""} onValueChange={(v) => { setSelectedSize(v); setSelectedColorCoreEmboss(null); }} data-testid="color-core-size-select">
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select size" />
                        </SelectTrigger>
                        <SelectContent>
                          {COLOR_CORE_SIZES.map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Color Core: Base Color swatches */}
                    <div className="config-section space-y-2">
                      <Label className="section-header">Base Color</Label>
                      <div className="grid grid-cols-5 gap-2">
                        {COLOR_CORE_COLORS.map((color) => (
                          <HoverCard key={color.id} openDelay={200} closeDelay={100}>
                            <HoverCardTrigger asChild>
                              <button
                                title={color.name}
                                onClick={() => setSelectedColorCoreColor(color)}
                                className={`relative aspect-square rounded border-2 transition-colors ${
                                  selectedColorCoreColor?.id === color.id
                                    ? "border-[hsl(30,40%,46%)]"
                                    : "border-transparent hover:border-[hsl(215,16%,47%)]"
                                }`}
                                style={{ backgroundColor: color.hex }}
                                data-testid={`color-core-color-${color.id}`}
                              />
                            </HoverCardTrigger>
                            <HoverCardContent side="right" align="start" className="w-48 p-0 overflow-hidden">
                              <div className="h-24 w-full" style={{ backgroundColor: color.hex }} />
                              <div className="p-3 space-y-1">
                                <p className="font-manrope font-bold text-sm">{color.name}</p>
                                <p className="text-xs text-[hsl(215,16%,47%)] font-mono">{color.hex}</p>
                              </div>
                            </HoverCardContent>
                          </HoverCard>
                        ))}
                      </div>
                      {selectedColorCoreColor && (
                        <p className="text-xs text-[hsl(215,16%,47%)] pt-1">
                          {selectedColorCoreColor.name} &mdash; {selectedColorCoreColor.id}
                        </p>
                      )}
                    </div>

                    {/* Color Core: Fabric Structure grid */}
                    <Accordion type="single" collapsible defaultValue="fabric-structure" className="config-accordion-wrapper">
                      <AccordionItem value="fabric-structure" className="border-0 px-4">
                        <AccordionTrigger className="section-header py-3">Fabric Texture</AccordionTrigger>
                        <AccordionContent className="pb-4">
                          <div className="thumbnail-grid" data-testid="fabric-structure-grid">
                            {COLOR_CORE_FABRIC_STRUCTURES.map((structure) => {
                              const thumbUrl = getColorCoreThumbnailUrl(structure.id, selectedColorCoreColor?.id ?? COLOR_CORE_COLORS[0].id);
                              const panelUrl = getColorCorePanelUrl(structure.id, selectedColorCoreColor?.id ?? COLOR_CORE_COLORS[0].id);
                              const isSelected = selectedFabricStructure?.id === structure.id;
                              return (
                                <HoverCard key={structure.id} openDelay={200} closeDelay={100}>
                                  <HoverCardTrigger asChild>
                                    <button
                                      onClick={() => setSelectedFabricStructure(structure)}
                                      className={`relative aspect-square rounded overflow-hidden border-2 transition-colors ${isSelected ? "border-[hsl(30,40%,46%)]" : "border-transparent hover:border-[hsl(215,16%,47%)]"}`}
                                      data-testid={`fabric-structure-${structure.id}`}
                                    >
                                      <img
                                        src={thumbUrl}
                                        alt={structure.name}
                                        className="absolute inset-0 w-full h-full object-cover"
                                      />
                                    </button>
                                  </HoverCardTrigger>
                                  <HoverCardContent side="right" align="start" className="w-56 p-0 overflow-hidden">
                                    <div className="relative w-full h-40 overflow-hidden">
                                      <img
                                        src={thumbUrl}
                                        alt={structure.name}
                                        className="absolute inset-0 w-full h-full object-cover"
                                      />
                                    </div>
                                    <div className="px-3 py-2">
                                      <p className="font-manrope font-bold text-sm">{structure.name}</p>
                                      <p className="text-xs text-[hsl(215,16%,47%)] mt-0.5">Fabric Texture</p>
                                    </div>
                                  </HoverCardContent>
                                </HoverCard>
                              );
                            })}
                          </div>
                          {selectedFabricStructure && (
                            <div className="mt-3 p-3 bg-[hsl(var(--secondary))] rounded-lg">
                              <p className="font-medium text-sm">{selectedFabricStructure.name}</p>
                            </div>
                          )}
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>

                    {/* Color Core: Emboss */}
                    {selectedSurfaceType !== 'flat' && (
                      <div className="config-section space-y-2">
                        <Label className="section-header">Emboss</Label>
                        <div className="thumbnail-grid" data-testid="color-core-emboss-grid">
                          {COLOR_CORE_EMBOSS_PATTERNS
                            .filter(pattern => !selectedSize || pattern.availableSizes.includes(selectedSize))
                            .map(pattern => (
                              <EmbossThumbnail
                                key={pattern.id}
                                pattern={pattern}
                                isSelected={selectedColorCoreEmboss?.id === pattern.id}
                                onSelect={(p) => setSelectedColorCoreEmboss(prev => prev?.id === p.id ? null : p)}
                              />
                            ))
                          }
                        </div>
                        {selectedColorCoreEmboss && (
                          <div className="mt-2 p-3 bg-[hsl(var(--secondary))] rounded-lg flex items-center justify-between">
                            <p className="font-medium text-sm">{selectedColorCoreEmboss.name}</p>
                            <button onClick={() => setSelectedColorCoreEmboss(null)} className="text-xs text-[hsl(215,16%,47%)] hover:text-red-500 ml-4">Clear</button>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : selectedCategory?.id === "fabrics-designer-textile" ? (
                  <>
                    {/* Designer Textile: 1. Size */}
                    <div className="config-section space-y-2">
                      <Label className="section-header">Size</Label>
                      <Select value={selectedDTSize || ""} onValueChange={(v) => { setSelectedDTSize(v); setSelectedDTEmboss(prev => prev && !prev.availableSizes.includes(v) ? null : prev); }} data-testid="dt-size-select">
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select size" />
                        </SelectTrigger>
                        <SelectContent>
                          {DESIGNER_TEXTILE_SIZES.map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Designer Textile: 2. Thickness */}
                    <div className="config-section space-y-2">
                      <Label className="section-header">Thickness</Label>
                      <Select value={selectedThickness || ""} onValueChange={setSelectedThickness} data-testid="dt-thickness-select">
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select thickness" />
                        </SelectTrigger>
                        <SelectContent>
                          {DESIGNER_TEXTILE_THICKNESSES.map((t) => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Designer Textile: 3. Color — all groups + shades in one compact card */}
                    <div className="config-section space-y-3">
                      <Label className="section-header">Color</Label>
                      {DESIGNER_TEXTILE_COLOR_GROUPS.map((group) => (
                        <div key={group.id}>
                          <p className="text-[10px] font-semibold text-[hsl(215,16%,47%)] uppercase tracking-wider mb-1.5">{group.name}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {group.shades.map((shade) => (
                              <HoverCard key={shade.id} openDelay={200} closeDelay={100}>
                                <HoverCardTrigger asChild>
                                  <button
                                    title={shade.id.replace('_', ' ')}
                                    onClick={() => {
                                      setSelectedDTColorGroup(group);
                                      setSelectedDTShade(shade);
                                      // Reset fabric to first one that supports this color group
                                      const firstAvailable = DESIGNER_TEXTILE_FABRICS.find(f => f.supportedColorGroups.includes(group.id));
                                      setSelectedDTFabric(firstAvailable ?? DESIGNER_TEXTILE_FABRICS[0]);
                                    }}
                                    className={`w-6 h-6 rounded border-2 transition-colors ${
                                      selectedDTShade?.id === shade.id
                                        ? "border-[hsl(30,40%,46%)] scale-110"
                                        : "border-transparent hover:border-[hsl(215,16%,47%)]"
                                    }`}
                                    style={{ backgroundColor: shade.hex }}
                                    data-testid={`dt-shade-${shade.id}`}
                                  />
                                </HoverCardTrigger>
                                <HoverCardContent side="right" align="start" className="w-44 p-0 overflow-hidden">
                                  <div className="h-20 w-full" style={{ backgroundColor: shade.hex }} />
                                  <div className="p-3 space-y-1">
                                    <p className="font-manrope font-bold text-sm">{group.name}</p>
                                    <p className="text-xs text-[hsl(215,16%,47%)]">{shade.id.replace('_', ' ')}</p>
                                    <p className="text-xs text-[hsl(215,16%,47%)] font-mono">{shade.hex}</p>
                                  </div>
                                </HoverCardContent>
                              </HoverCard>
                            ))}
                          </div>
                        </div>
                      ))}
                      {selectedDTShade && (
                        <p className="text-xs text-[hsl(215,16%,47%)] pt-0.5">
                          {selectedDTColorGroup?.name} — {selectedDTShade.id.replace('_', ' ')}
                        </p>
                      )}
                    </div>

                    {/* Designer Textile: 4. Fabric Texture — live thumbnails, cannot unselect */}
                    <div className="config-section space-y-2">
                      <Label className="section-header">Fabric Texture</Label>
                      {!selectedDTShade ? (
                        <p className="text-sm text-[hsl(215,16%,47%)]">Select a shade above to view fabric textures.</p>
                      ) : (
                        <>
                          <div className="grid grid-cols-3 gap-2" data-testid="dt-fabric-grid">
                            {DESIGNER_TEXTILE_FABRICS
                              .filter(f => !selectedDTColorGroup || f.supportedColorGroups.includes(selectedDTColorGroup.id))
                              .map((fabric) => {
                                const isSelected = selectedDTFabric?.id === fabric.id;
                                const thumbUrl = getDesignerTextileThumbnailUrl(fabric.id, selectedDTShade?.id);
                                return (
                                  <HoverCard key={fabric.id} openDelay={200} closeDelay={100}>
                                    <HoverCardTrigger asChild>
                                      <button
                                        title={fabric.name}
                                        onClick={() => setSelectedDTFabric(fabric)}
                                        className={`relative aspect-square rounded overflow-hidden border-2 transition-colors ${
                                          isSelected ? "border-[hsl(30,40%,46%)]" : "border-transparent hover:border-[hsl(215,16%,47%)]"
                                        }`}
                                        data-testid={`dt-fabric-${fabric.id}`}
                                      >
                                        <img
                                          src={thumbUrl}
                                          alt={fabric.name}
                                          className="absolute inset-0 w-full h-full object-cover"
                                        />
                                        <span className="absolute bottom-0 left-0 right-0 text-[10px] text-center font-semibold text-white bg-black/40 py-0.5">
                                          {fabric.name}
                                        </span>
                                      </button>
                                    </HoverCardTrigger>
                                    <HoverCardContent side="right" align="start" className="w-56 p-0 overflow-hidden">
                                      <div className="relative w-full h-40 overflow-hidden">
                                        <img
                                          src={thumbUrl}
                                          alt={fabric.name}
                                          className="absolute inset-0 w-full h-full object-cover"
                                        />
                                      </div>
                                      <div className="px-3 py-2">
                                        <p className="font-manrope font-bold text-sm">{fabric.name}</p>
                                        <p className="text-xs text-[hsl(215,16%,47%)] mt-0.5">Fabric Texture</p>
                                      </div>
                                    </HoverCardContent>
                                  </HoverCard>
                                );
                              })
                            }
                          </div>
                          {selectedDTFabric && (
                            <p className="text-xs text-[hsl(215,16%,47%)] pt-0.5">{selectedDTFabric.name} selected</p>
                          )}
                        </>
                      )}
                    </div>

                    {/* Designer Textile: 5. Emboss */}
                    {selectedSurfaceType !== 'flat' && (
                      <div className="config-section space-y-2">
                        <Label className="section-header">Emboss</Label>
                        <div className="thumbnail-grid" data-testid="dt-emboss-grid">
                          {DESIGNER_TEXTILE_EMBOSS_PATTERNS
                            .filter(pattern => !selectedDTSize || pattern.availableSizes.includes(selectedDTSize))
                            .map(pattern => (
                              <EmbossThumbnail
                                key={pattern.id}
                                pattern={pattern}
                                isSelected={selectedDTEmboss?.id === pattern.id}
                                onSelect={(p) => setSelectedDTEmboss(prev => prev?.id === p.id ? null : p)}
                              />
                            ))
                          }
                        </div>
                        {selectedDTEmboss && (
                          <div className="mt-2 p-3 bg-[hsl(var(--secondary))] rounded-lg flex items-center justify-between">
                            <p className="font-medium text-sm">{selectedDTEmboss.name}</p>
                            <button onClick={() => setSelectedDTEmboss(null)} className="text-xs text-[hsl(215,16%,47%)] hover:text-red-500 ml-4">Clear</button>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : selectedCategory?.id === "wood-perforations" && !selectedWoodPerfSize ? (
                    <div className="config-section">
                      <p className="section-header mb-1">Print</p>
                      <p className="text-sm text-[hsl(215,16%,47%)]">Select a size above to view available prints.</p>
                    </div>
                ) : filteredDesigns.length > 0 ? (
                  <Accordion type="single" collapsible defaultValue="print" className="config-accordion-wrapper">
                    <AccordionItem value="print" className="border-0 px-4">
                      <AccordionTrigger className="section-header py-3">Print</AccordionTrigger>
                      <AccordionContent className="pb-4">
                        <div className="thumbnail-grid" data-testid="design-grid">
                          {filteredDesigns.map((design) => (
                            <DesignThumbnail
                              key={design.id}
                              design={design}
                              isSelected={selectedDesign?.id === design.id}
                              onSelect={handleDesignSelect}
                            />
                          ))}
                        </div>
                        {selectedDesign && (
                          <div className="mt-3 p-3 bg-[hsl(var(--secondary))] rounded-lg">
                            <p className="font-medium text-sm">{selectedDesign.design_name}</p>
                            <p className="text-xs text-[hsl(215,16%,47%)]">{selectedDesign.design_code}</p>
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                ) : null}

                {/* 4. Emboss — shown for emboss-enabled categories in Embossed/Grooving; hidden in Flat */}
                {selectedCategory?.emboss_available && selectedSurfaceType !== 'flat' && selectedCategory?.id !== "fabrics-color-core" && selectedCategory?.id !== "fabrics-designer-textile" && (() => {
                  const availableEmbossIds = selectedDesign?.available_emboss ?? [];
                  // Hide the entire section if a design is selected but it has no emboss options
                  if (selectedDesign && availableEmbossIds.length === 0) return null;
                  return (
                    <div className="config-section space-y-2">
                      <Label className="section-header">Emboss</Label>
                      {!selectedDesign && (
                        <p className="text-xs text-[hsl(215,16%,47%)]">Select a print to enable emboss options.</p>
                      )}
                      <div className="thumbnail-grid" data-testid="emboss-grid">
                        {selectedDesign && FLAT_EMBOSSED_EMBOSS_PATTERNS
                          .filter(pattern => availableEmbossIds.includes(pattern.id))
                          .map(pattern => (
                            <EmbossThumbnail
                              key={pattern.id}
                              pattern={pattern}
                              isSelected={selectedEmbossPattern?.id === pattern.id}
                              onSelect={handleEmbossPatternSelect}
                            />
                          ))
                        }
                      </div>
                      {selectedEmbossPattern && (
                        <div className="mt-2 p-3 bg-[hsl(var(--secondary))] rounded-lg">
                          <p className="font-medium text-sm">{selectedEmbossPattern.name}</p>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* 3b. Perforation Pattern — wood-perforations only, shown after size selected */}
                {selectedCategory?.id === "wood-perforations" && selectedWoodPerfSize && (
                  <Accordion type="single" collapsible defaultValue="perforation" className="config-accordion-wrapper">
                    <AccordionItem value="perforation" className="border-0 px-4">
                      <AccordionTrigger className="section-header py-3">Perforation Pattern</AccordionTrigger>
                      <AccordionContent className="pb-4">
                        <div className="thumbnail-grid" data-testid="perforation-grid">
                          {WOOD_PERFORATION_PATTERNS
                            .filter(p => !(WOOD_PERFORATION_EXCLUSIONS[selectedWoodPerfSize] ?? []).includes(p.id))
                            .map(p => (
                              <HoverCard key={p.id} openDelay={200} closeDelay={100}>
                                <HoverCardTrigger asChild>
                                  <button
                                    onClick={() => setSelectedPerforation(prev => prev?.id === p.id ? null : p)}
                                    className={`relative aspect-square rounded overflow-hidden border-2 transition-colors ${selectedPerforation?.id === p.id ? "border-[hsl(30,40%,46%)]" : "border-transparent hover:border-[hsl(215,16%,47%)]"}`}
                                    data-testid={`perforation-${p.id}`}
                                  >
                                      {/* White background so transparent PNG holes are clearly visible */}
                                    <div className="absolute inset-0 bg-white" />
                                    <img
                                      src={p.thumbnailUrl}
                                      alt={p.name}
                                      className="absolute inset-0 w-full h-full object-cover"
                                      style={{ transform: "scale(3)", transformOrigin: "center" }}
                                    />
                                  </button>
                                </HoverCardTrigger>
                                <HoverCardContent side="right" align="start" className="w-56 p-0 overflow-hidden">
                                  {/* Zoomed-in view in hover: white bg + scale so holes are clearly visible */}
                                  <div className="relative w-full h-40 bg-white overflow-hidden">
                                    <img
                                      src={p.thumbnailUrl}
                                      alt={p.name}
                                      className="absolute inset-0 w-full h-full object-contain"
                                      style={{ transform: "scale(3)", transformOrigin: "center" }}
                                    />
                                  </div>
                                  <div className="px-3 py-2">
                                    <p className="font-manrope font-bold text-sm">{p.name}</p>
                                    <p className="text-xs text-[hsl(215,16%,47%)] mt-0.5">Perforation Pattern</p>
                                  </div>
                                </HoverCardContent>
                              </HoverCard>
                            ))
                          }
                        </div>
                        {selectedPerforation && (
                          <div className="mt-2 p-3 bg-[hsl(var(--secondary))] rounded-lg flex items-center justify-between">
                            <p className="font-medium text-sm">{selectedPerforation.name}</p>
                            <button onClick={() => setSelectedPerforation(null)} className="text-xs text-[hsl(215,16%,47%)] hover:text-red-500 ml-4">Clear</button>
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                )}

              </div>
            )}

            {/* ── Ombre Options ─────────────────────────────────────────────── */}
            {selectedProductType?.id === "ombre" && (
              <div className="flex flex-col">
                {/* 0. Category — filtered by surface type */}
                {filteredCategories.length > 0 && (
                  <div className="config-section space-y-2">
                    <Label className="section-header">Category</Label>
                    <Select value={selectedCategory?.id ?? ""} onValueChange={handleCategoryChange} data-testid="ombre-category-select">
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredCategories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* ── Signature Ombre: real-time 3D configurator ── */}
                {selectedCategory?.id === "signature-ombre" ? (
                  <>
                    {/* Product info */}
                    <div className="config-section">
                      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Signature Ombre</div>
                      <div style={{ fontSize: 11, color: '#8a8480' }}>1200 × 2800 mm · 3-Panel Wall Setup</div>
                    </div>

                    {/* Thickness — above Ombre Colors */}
                    {selectedProductType?.thicknesses?.length > 0 && (
                      <div className="config-section space-y-2">
                        <Label className="section-header">Thickness</Label>
                        <Select value={selectedThickness || ""} onValueChange={setSelectedThickness} data-testid="so-thickness-select">
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select thickness" />
                          </SelectTrigger>
                          <SelectContent>
                            {selectedProductType.thicknesses.map((t) => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Ombre Colors */}
                    <div className="config-section space-y-3">
                      <Label className="section-header">Ombre Colors</Label>
                      <div style={{ display: 'flex', gap: 12, marginBottom: 4 }}>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                          <span style={{ fontSize: 11, color: '#8a8480', fontWeight: 500 }}>Base Color</span>
                          <div style={{ height: 52, borderRadius: 10, border: '2px solid #e2ddd7', background: soBaseColor, position: 'relative', overflow: 'hidden', cursor: 'pointer' }}>
                            <input type="color" value={soBaseColor} onChange={(e) => setSoBaseColor(e.target.value)}
                              style={{ opacity: 0, position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'pointer' }} />
                          </div>
                          <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#8a8480', textAlign: 'center', textTransform: 'uppercase' }}>{soBaseColor}</div>
                        </div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                          <span style={{ fontSize: 11, color: '#8a8480', fontWeight: 500 }}>Overlay Color</span>
                          <div style={{ height: 52, borderRadius: 10, border: '2px solid #e2ddd7', background: soOverlayColor, position: 'relative', overflow: 'hidden', cursor: 'pointer' }}>
                            <input type="color" value={soOverlayColor} onChange={(e) => setSoOverlayColor(e.target.value)}
                              style={{ opacity: 0, position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'pointer' }} />
                          </div>
                          <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#8a8480', textAlign: 'center', textTransform: 'uppercase' }}>{soOverlayColor}</div>
                        </div>
                      </div>
                      {/* Ombre preview bar */}
                      <div style={{ height: 28, borderRadius: 8, border: '1px solid #e2ddd7', marginBottom: 8,
                        background: `linear-gradient(to bottom, ${soBaseColor} 0%, ${soBaseColor} ${soBlend}%, ${soOverlayColor} 100%)` }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#8a8480', marginBottom: 4 }}>
                        <span>Ombre Blend</span>
                        <span style={{ color: '#c4956a', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{soBlend}%</span>
                      </div>
                      <input type="range" min={10} max={90} step={1} value={soBlend}
                        onChange={(e) => setSoBlend(parseInt(e.target.value))}
                        style={{ width: '100%', accentColor: '#c4956a', cursor: 'pointer' }} />
                    </div>

                    {/* Emboss Pattern */}
                    <div className="config-section space-y-2">
                      <Label className="section-header">Emboss Pattern</Label>
                      {soIsLoading ? (
                        <p style={{ fontSize: 11, color: '#8a8480' }}>Loading 3D patterns…</p>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                          {SO_PATTERNS.map((p) => {
                            const isSel = soSelectedPattern === p.id;
                            return (
                              <button key={p.id} type="button" onClick={() => setSoSelectedPattern(prev => prev === p.id ? null : p.id)}
                                style={{
                                  background: isSel ? 'rgba(196,149,106,0.06)' : '#f5f2ee',
                                  border: `2px solid ${isSel ? '#c4956a' : '#e2ddd7'}`,
                                  borderRadius: 10, padding: '10px 6px', cursor: 'pointer',
                                  textAlign: 'center', position: 'relative',
                                  boxShadow: isSel ? '0 0 0 1px #c4956a' : 'none',
                                  fontFamily: 'inherit',
                                }}
                              >
                                {isSel && (
                                  <div style={{ position: 'absolute', top: 5, right: 5, width: 14, height: 14,
                                    background: '#c4956a', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" width="8" height="8"><polyline points="20 6 9 17 4 12" /></svg>
                                  </div>
                                )}
                                <div style={{ height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
                                  <svg viewBox="0 0 24 24" fill="none" stroke={isSel ? '#c4956a' : '#8a8480'} strokeWidth="1" width="26" height="26">
                                    <path d={SO_PAT_ICONS[p.id]} />
                                  </svg>
                                </div>
                                <div style={{ fontSize: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: isSel ? '#c4956a' : '#8a8480' }}>
                                  {p.name}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* HDRI Lighting */}
                    <div className="config-section space-y-2">
                      <Label className="section-header">HDRI Lighting</Label>
                      <SignatureOmbreLightRing rotation={soLightRotation} onChange={setSoLightRotation} />
                    </div>

                    {/* Thickness — removed from here, now shown above Ombre Colors */}
                  </>
                ) : selectedCategory?.id === "ombre-color-core-ombre" ? (
                  <>
                    {/* ── Color Core Ombre controls (existing) ── */}
                    {/* 1. Size */}
                    {selectedProductType?.sizes?.length > 0 && (
                      <div className="config-section space-y-2">
                        <Label className="section-header">Size</Label>
                        <Select value={selectedSize || ""} onValueChange={handleOmbreSizeChange} data-testid="ombre-size-select">
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select size" />
                          </SelectTrigger>
                          <SelectContent>
                            {selectedProductType.sizes.map((s) => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                {/* 1b. Thickness — above Base Color */}
                {selectedProductType?.thicknesses?.length > 0 && (
                  <div className="config-section space-y-2">
                    <Label className="section-header">Thickness</Label>
                    <Select value={selectedThickness || ""} onValueChange={setSelectedThickness} data-testid="ombre-thickness-select">
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select thickness" />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedProductType.thicknesses.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* 2. Base Colors */}
                <div className="config-section space-y-2">
                  <Label className="section-header">Base Color</Label>
                  <div className="grid grid-cols-5 gap-2">
                    {OMBRE_COLOR_CORE_BASE_COLORS.map((color) => (
                      <HoverCard key={color.id} openDelay={200} closeDelay={100}>
                        <HoverCardTrigger asChild>
                          <button
                            title={color.name}
                            onClick={() => {
                              setSelectedOmbreBaseColor(color);
                              // Auto-select first overlay so the preview updates immediately
                              setSelectedOmbreOverlay(OMBRE_COLOR_CORE_OVERLAYS[color.id]?.[0] ?? null);
                              // Clear any selected finish pattern
                              setSelectedOmbreEmbossPattern(null);
                              setSelectedOmbreGroovePattern(null);
                            }}
                            className={`relative aspect-square rounded border-2 transition-colors ${
                              selectedOmbreBaseColor?.id === color.id
                                ? "border-[hsl(30,40%,46%)]"
                                : "border-transparent hover:border-[hsl(215,16%,47%)]"
                            }`}
                            style={{ backgroundColor: color.hex }}
                            data-testid={`ombre-base-color-${color.id}`}
                          />
                        </HoverCardTrigger>
                        <HoverCardContent side="right" align="start" className="w-48 p-0 overflow-hidden">
                          <div className="h-24 w-full" style={{ backgroundColor: color.hex }} />
                          <div className="p-3 space-y-1">
                            <p className="font-manrope font-bold text-sm">{color.name}</p>
                            <p className="text-xs text-[hsl(215,16%,47%)] font-mono">{color.hex}</p>
                          </div>
                        </HoverCardContent>
                      </HoverCard>
                    ))}
                  </div>
                  {selectedOmbreBaseColor && (
                    <p className="text-xs text-[hsl(215,16%,47%)] pt-1">
                      {selectedOmbreBaseColor.name}
                    </p>
                  )}
                </div>

                {/* 3. Ombre Overlay Colors */}
                <div className="config-section space-y-2">
                  <Label className="section-header">Ombre Overlay</Label>
                  {!selectedOmbreBaseColor ? (
                    <p className="text-sm text-[hsl(215,16%,47%)]">Select a base color above.</p>
                  ) : (
                    <div className="grid grid-cols-5 gap-2">
                      {(OMBRE_COLOR_CORE_OVERLAYS[selectedOmbreBaseColor.id] ?? []).map((overlay) => (
                        <HoverCard key={overlay.filename} openDelay={200} closeDelay={100}>
                          <HoverCardTrigger asChild>
                            <button
                              title={overlay.hex}
                              onClick={() => {
                                setSelectedOmbreOverlay(prev =>
                                  prev?.filename === overlay.filename ? null : overlay
                                );
                                setSelectedOmbreEmbossPattern(null);
                                setSelectedOmbreGroovePattern(null);
                              }}
                              className={`relative aspect-square rounded border-2 transition-colors ${
                                selectedOmbreOverlay?.filename === overlay.filename
                                  ? "border-[hsl(30,40%,46%)]"
                                  : "border-transparent hover:border-[hsl(215,16%,47%)]"
                              }`}
                              style={{ backgroundColor: overlay.hex }}
                              data-testid={`ombre-overlay-${overlay.hex}`}
                            />
                          </HoverCardTrigger>
                          <HoverCardContent side="right" align="start" className="w-48 p-0 overflow-hidden">
                            <div
                              className="h-24 w-full"
                              style={{ background: `linear-gradient(to bottom, ${selectedOmbreBaseColor?.hex ?? '#ccc'} 0%, ${overlay.hex} 100%)` }}
                            />
                            <div className="p-3 space-y-1">
                              <p className="font-manrope font-bold text-sm">Ombre Overlay</p>
                              <p className="text-xs text-[hsl(215,16%,47%)] font-mono">{overlay.hex}</p>
                            </div>
                          </HoverCardContent>
                        </HoverCard>
                      ))}
                    </div>
                  )}
                  {selectedOmbreOverlay && (
                    <p className="text-xs text-[hsl(215,16%,47%)] pt-1">
                      Overlay {selectedOmbreOverlay.hex}
                    </p>
                  )}
                  {/* T-Patti toggle */}
                  {selectedCategory?.id && FLAT_EMBOSSED_VMT_CONFIG[selectedCategory.id]?.tpatti && (
                    <div className="flex items-center justify-between mt-3 p-3 bg-[hsl(var(--secondary))] rounded-lg">
                      <Label htmlFor="ombre-tpatti-toggle" className="text-sm font-medium">T-Profile Overlay</Label>
                      <Switch id="ombre-tpatti-toggle" checked={showTpatti} onCheckedChange={setShowTpatti} data-testid="ombre-tpatti-toggle" />
                    </div>
                  )}
                </div>

                {/* 4. Emboss / Groove Pattern */}
                <div className="config-section space-y-3">
                  <Label className="section-header">Pattern</Label>

                  {/* Segmented toggle: Emboss | Groove — hidden when surface type is Grooving */}
                  {selectedSurfaceType !== 'grooving' && (
                  <div className="flex rounded-md overflow-hidden border border-[hsl(var(--border))]">
                    <button
                      disabled={selectedSize === "1200x2400"}
                      onClick={() => {
                        setOmbreFinishType("emboss");
                        setSelectedOmbreGroovePattern(null);
                      }}
                      className={`flex-1 py-1.5 text-sm font-medium transition-colors ${
                        selectedSize === "1200x2400"
                          ? "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] opacity-50 cursor-not-allowed"
                          : ombreFinishType === "emboss"
                            ? "bg-[hsl(30,40%,46%)] text-white"
                            : "bg-[hsl(var(--background))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]"
                      }`}
                      data-testid="ombre-finish-emboss"
                    >
                      Emboss
                    </button>
                    <button
                      onClick={() => {
                        setOmbreFinishType("groove");
                        setSelectedOmbreEmbossPattern(null);
                      }}
                      className={`flex-1 py-1.5 text-sm font-medium border-l border-[hsl(var(--border))] transition-colors ${
                        ombreFinishType === "groove"
                          ? "bg-[hsl(30,40%,46%)] text-white"
                          : "bg-[hsl(var(--background))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]"
                      }`}
                      data-testid="ombre-finish-groove"
                    >
                      Groove
                    </button>
                  </div>
                  )}

                  {/* Emboss pattern thumbnails */}
                  {ombreFinishType === "emboss" && (
                    <div className="grid grid-cols-3 gap-2">
                      {OMBRE_COLOR_CORE_EMBOSS_PATTERNS.map((pattern) => (
                        <button
                          key={pattern.id}
                          title={pattern.name}
                          onClick={() => setSelectedOmbreEmbossPattern(prev =>
                            prev?.id === pattern.id ? null : pattern
                          )}
                          className={`relative aspect-square rounded border-2 overflow-hidden transition-colors ${
                            selectedOmbreEmbossPattern?.id === pattern.id
                              ? "border-[hsl(30,40%,46%)]"
                              : "border-transparent hover:border-[hsl(215,16%,47%)]"
                          }`}
                          data-testid={`ombre-emboss-${pattern.id}`}
                        >
                          <img src={pattern.thumbnailUrl} alt={pattern.name} className="w-full h-full object-cover" draggable={false} loading="lazy" decoding="async" />
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Groove pattern thumbnails */}
                  {ombreFinishType === "groove" && (
                    <div className="grid grid-cols-3 gap-2">
                      {OMBRE_COLOR_CORE_GROOVE_PATTERNS.map((pattern) => (
                        <button
                          key={pattern.id}
                          title={pattern.name}
                          onClick={() => setSelectedOmbreGroovePattern(prev =>
                            prev?.id === pattern.id ? null : pattern
                          )}
                          className={`relative aspect-square rounded border-2 overflow-hidden transition-colors ${
                            selectedOmbreGroovePattern?.id === pattern.id
                              ? "border-[hsl(30,40%,46%)]"
                              : "border-transparent hover:border-[hsl(215,16%,47%)]"
                          }`}
                          data-testid={`ombre-groove-${pattern.id}`}
                        >
                          <img src={pattern.thumbnailUrl} alt={pattern.name} className="w-full h-full object-cover" draggable={false} loading="lazy" decoding="async" />
                        </button>
                      ))}
                    </div>
                  )}

                  {(selectedOmbreEmbossPattern || selectedOmbreGroovePattern) && (
                    <p className="text-xs text-[hsl(215,16%,47%)] pt-1">
                      {selectedOmbreEmbossPattern?.name ?? selectedOmbreGroovePattern?.name}
                    </p>
                  )}
                </div>

                {/* 5. Thickness — removed, now shown above Base Color */}
                  </>
                ) : null}
              </div>
            )}

            {/* Generic Product Options (non-VicStrip, non-flat-embossed-vmd, non-wood, non-fabrics, non-ombre) */}
            {selectedProductType?.id !== "vicstrip" && selectedProductType?.id !== "flat-embossed-vmd" && selectedProductType?.id !== "wood" && selectedProductType?.id !== "fabrics" && selectedProductType?.id !== "ombre" && (
              <Accordion type="multiple" defaultValue={["category", "options", "designs"]} className="flex flex-col">
                {/* Category Selector */}
                {selectedProductType?.categories?.length > 0 && (
                  <AccordionItem value="category" className="config-accordion">
                    <AccordionTrigger className="section-header py-3">
                      Category
                    </AccordionTrigger>
                    <AccordionContent className="pb-4">
                      <Select 
                        value={selectedCategory?.id} 
                        onValueChange={handleCategoryChange}
                        data-testid="category-select"
                      >
                        <SelectTrigger className="w-full" data-testid="category-trigger">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          {selectedProductType.categories.map((category) => (
                            <SelectItem 
                              key={category.id} 
                              value={category.id}
                              data-testid={`category-${category.id}`}
                            >
                              {category.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* Emboss Toggle (only for emboss-available categories) */}
                      {selectedCategory?.emboss_available && (
                        <div className="flex items-center justify-between mt-4 p-3 bg-[hsl(var(--secondary))] rounded-lg">
                          <Label htmlFor="emboss-toggle" className="text-sm font-medium">
                            Embossed Finish
                          </Label>
                          <Switch
                            id="emboss-toggle"
                            checked={isEmbossed}
                            onCheckedChange={setIsEmbossed}
                            data-testid="emboss-toggle"
                          />
                        </div>
                      )}

                      {/* T-Patti Toggle (only for flat-embossed-vmd categories that have a tpatti defined) */}
                      {selectedProductType?.id === "flat-embossed-vmd" &&
                        selectedCategory?.id &&
                        FLAT_EMBOSSED_VMT_CONFIG[selectedCategory.id]?.tpatti && (
                        <div className="flex items-center justify-between mt-4 p-3 bg-[hsl(var(--secondary))] rounded-lg">
                          <Label htmlFor="tpatti-toggle" className="text-sm font-medium">
                            T-Profile Overlay
                          </Label>
                          <Switch
                            id="tpatti-toggle"
                            checked={showTpatti}
                            onCheckedChange={setShowTpatti}
                            data-testid="tpatti-toggle"
                          />
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                )}

                {/* Size, Density, Pattern, Thickness Options */}
                <AccordionItem value="options" className="config-accordion">
                  <AccordionTrigger className="section-header py-3">Options</AccordionTrigger>
                  <AccordionContent className="pb-4 space-y-4">
                    {/* Size */}
                    {selectedProductType?.sizes?.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Size (mm)</Label>
                        <Select 
                          value={selectedSize || ""} 
                          onValueChange={setSelectedSize}
                          data-testid="size-select"
                        >
                          <SelectTrigger className="w-full" data-testid="size-trigger">
                            <SelectValue placeholder="Select size" />
                          </SelectTrigger>
                          <SelectContent>
                            {selectedProductType.sizes.map((size) => (
                              <SelectItem key={size} value={size} data-testid={`size-${size}`}>
                                {size}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Density */}
                    {selectedProductType?.densities?.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Density</Label>
                        <Select 
                          value={selectedDensity || ""} 
                          onValueChange={setSelectedDensity}
                          data-testid="density-select"
                        >
                          <SelectTrigger className="w-full" data-testid="density-trigger">
                            <SelectValue placeholder="Select density" />
                          </SelectTrigger>
                          <SelectContent>
                            {selectedProductType.densities.map((density) => (
                              <SelectItem key={density} value={density} data-testid={`density-${density}`}>
                                {density}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Thickness */}
                    {selectedProductType?.thicknesses?.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Thickness</Label>
                        <Select 
                          value={selectedThickness || ""} 
                          onValueChange={setSelectedThickness}
                          data-testid="thickness-select"
                        >
                          <SelectTrigger className="w-full" data-testid="thickness-trigger">
                            <SelectValue placeholder="Select thickness" />
                          </SelectTrigger>
                          <SelectContent>
                            {selectedProductType.thicknesses.map((thickness) => (
                              <SelectItem key={thickness} value={thickness} data-testid={`thickness-${thickness}`}>
                                {thickness}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>

                {/* Color Swatches */}
                {selectedProductType?.colors?.length > 0 && (
                  <AccordionItem value="colors" className="config-accordion">
                    <AccordionTrigger className="section-header py-3">Colors</AccordionTrigger>
                    <AccordionContent className="pb-4">
                      <div className="color-grid" data-testid="color-grid">
                        {selectedProductType.colors.map((color, index) => (
                          <button
                            key={index}
                            className={`color-swatch ${selectedColor === color ? 'selected' : ''}`}
                            style={{ backgroundColor: color }}
                            onClick={() => setSelectedColor(color)}
                            data-testid={`color-swatch-${index}`}
                            aria-label={`Select color ${color}`}
                          />
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                )}

                {/* Design Thumbnails */}
                {selectedCategory?.designs?.length > 0 && (
                  <AccordionItem value="designs" className="config-accordion">
                    <AccordionTrigger className="section-header py-3">Designs</AccordionTrigger>
                    <AccordionContent className="pb-4">
                      <div className="thumbnail-grid" data-testid="design-grid">
                        {selectedCategory.designs.map((design) => (
                          <DesignThumbnail
                            key={design.id}
                            design={design}
                            isSelected={selectedDesign?.id === design.id}
                            onSelect={handleDesignSelect}
                          />
                        ))}
                      </div>
                      {selectedDesign && (
                        <div className="mt-3 p-3 bg-[hsl(var(--secondary))] rounded-lg">
                          <p className="font-medium text-sm">{selectedDesign.design_name}</p>
                          <p className="text-xs text-[hsl(215,16%,47%)]">{selectedDesign.design_code}</p>
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                )}
              </Accordion>
            )}
          </div>
        </ScrollArea>

        {/* Action Bar */}
        <div className="action-bar" data-testid="action-bar">
          <Button
            variant="outline"
            size="sm"
            onClick={resetConfig}
            className="flex-1"
            data-testid="reset-btn"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Reset
          </Button>
          
          <Dialog open={favoritesOpen} onOpenChange={setFavoritesOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 relative"
                data-testid="favorites-btn"
              >
                <Heart className="h-4 w-4 mr-2" />
                Saved
                {favorites.length > 0 && (
                  <span className="absolute -top-1 -right-1 h-5 w-5 bg-[hsl(30,40%,46%)] text-white text-xs rounded-full flex items-center justify-center">
                    {favorites.length}
                  </span>
                )}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl" data-testid="favorites-modal">
              <DialogHeader>
                <DialogTitle className="font-manrope">Saved Configurations</DialogTitle>
              </DialogHeader>
              {favorites.length === 0 ? (
                <div className="py-12 text-center text-[hsl(215,16%,47%)]">
                  <Heart className="h-12 w-12 mx-auto mb-4 opacity-30" />
                  <p>No saved configurations yet</p>
                </div>
              ) : (
                <ScrollArea className="max-h-[60vh]">
                  <div className="favorites-grid p-1 space-y-2">
                    {favorites.map((favorite) => (
                      <div
                        key={favorite.id}
                        className="favorite-card p-3 border rounded-lg cursor-pointer hover:bg-[hsl(var(--secondary))] transition-colors"
                        onClick={() => loadFavorite(favorite)}
                        data-testid={`favorite-card-${favorite.id}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <p className="font-medium text-sm">
                              {favorite.productTypeId === "vicstrip" 
                                ? favorite.pattern?.name 
                                : favorite.design?.design_name || favorite.productType}
                            </p>
                            <p className="text-xs text-[hsl(215,16%,47%)]">
                              {favorite.productTypeId === "vicstrip"
                                ? favorite.color?.name
                                : favorite.category || favorite.productType}
                            </p>
                            <p className="text-xs text-[hsl(215,16%,47%)] mt-1">
                              {new Date(favorite.timestamp).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <div
                              className="w-12 h-12 rounded border"
                              style={{ 
                                backgroundColor: favorite.productTypeId === "vicstrip" 
                                  ? favorite.color?.hex 
                                  : (favorite.design?.texture_color || "#CCCCCC")
                              }}
                            />
                            <button
                              onClick={(e) => deleteFavorite(favorite.id, e)}
                              className="p-1 hover:bg-red-100 rounded text-red-500"
                              data-testid={`delete-favorite-${favorite.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </DialogContent>
          </Dialog>
        </div>
        {/* Caveat */}
        <p className="px-4 py-2 text-[0.62rem] text-[hsl(215,16%,60%)] leading-tight border-t border-[hsl(var(--border))]">
          *This configurator provides an indicative visualization only. Actual product appearance may vary due to lighting conditions, surface textures, material finishes, and installation environment.
        </p>
      </aside>

      {/* Canvas Preview Area */}
      <main className="canvas-area" data-testid="canvas-area">

        {/* HDRI Studio Lighting Control */}
        <div className="absolute bottom-32 right-4 z-10 select-none" data-testid="hdri-lighting-control">
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg border border-[hsl(var(--border))] p-2 flex flex-col items-stretch gap-1">
            <p className="text-[9px] font-bold text-[hsl(215,16%,55%)] uppercase tracking-widest text-center pb-0.5">Studio Lighting</p>
            {[
              { id: 'none', label: 'Off',  dot: '#CBD5E1' },
              { id: 'warm', label: 'Warm', dot: '#F59E0B' },
              { id: 'soft', label: 'Soft', dot: '#93C5FD' },
            ].map(({ id, label, dot }) => (
              <button
                key={id}
                onClick={() => setHdriLighting(id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  hdriLighting === id
                    ? 'bg-[hsl(30,40%,46%)] text-white'
                    : 'text-[hsl(215,16%,47%)] hover:bg-[hsl(var(--secondary))]'
                }`}
                data-testid={`lighting-${id}`}
                aria-pressed={hdriLighting === id}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: hdriLighting === id ? 'rgba(255,255,255,0.75)' : dot }}
                />
                {label}
              </button>
            ))}
            {/* Angle dial — visible only when a lighting mode is active */}
            {hdriLighting !== 'none' && (
              <div className="pt-1.5 mt-0.5 border-t border-[hsl(var(--border))]">
                <p className="text-[9px] font-bold text-[hsl(215,16%,55%)] uppercase tracking-widest text-center mb-1">Angle</p>
                <LightingAngleDial
                  angle={lightAngle}
                  onChange={setLightAngle}
                  accentColor={hdriLighting === 'warm' ? '#F59E0B' : '#93C5FD'}
                />
              </div>
            )}
          </div>
        </div>

        {/* Zoom Controls */}
        <div className="absolute top-4 right-4 flex flex-col gap-1 z-10" data-testid="zoom-controls">
          <Button
            variant="outline"
            size="icon"
            onClick={zoomIn}
            disabled={zoomLevel >= ZOOM_MAX}
            className="bg-white/90 backdrop-blur-sm shadow-lg hover:bg-white h-8 w-8"
            data-testid="zoom-in-btn"
            aria-label="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <div className="text-xs text-center text-[hsl(215,16%,47%)] bg-white/90 backdrop-blur-sm rounded px-1 py-0.5 shadow font-medium">
            {Math.round(zoomLevel * 100)}%
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={zoomOut}
            disabled={zoomLevel <= ZOOM_MIN}
            className="bg-white/90 backdrop-blur-sm shadow-lg hover:bg-white h-8 w-8"
            data-testid="zoom-out-btn"
            aria-label="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
        </div>

        {/* Preview Component — routes by product type */}
        <div
          ref={magnifierRef}
          className="relative rounded-3xl overflow-hidden shadow-lg inset-shadow-lg inset-shadow-indigo-500/100"
          style={{
            cursor: zoomLevel > 1 ? (isDragging ? 'grabbing' : 'grab') : undefined,
          }}
          onMouseDown={handlePanStart}
          onMouseMove={(e) => {
            handlePanMove(e);
            if (!isDraggingRef.current && magnifierDivRef.current && magnifierRef.current) {
              const rect = magnifierRef.current.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const y = e.clientY - rect.top;
              // Move the lens circle to follow the cursor
              magnifierDivRef.current.style.top = `${y}px`;
              magnifierDivRef.current.style.left = `${x}px`;
              // Shift the clone inside the lens so the cursor point is centred
              if (lensCloneRef.current) {
                lensCloneRef.current.style.top = `${MAGNIFIER_SIZE / 2 - y * MAGNIFIER_ZOOM}px`;
                lensCloneRef.current.style.left = `${MAGNIFIER_SIZE / 2 - x * MAGNIFIER_ZOOM}px`;
              }
            }
          }}
          onMouseUp={handlePanEnd}
          onMouseEnter={handleMagnifierEnter}
          onMouseLeave={() => {
            handlePanEnd();
            setMagnifierActive(false);
            // Clear clone to free memory
            const lens = magnifierDivRef.current;
            if (lens) while (lens.firstChild) lens.removeChild(lens.firstChild);
            lensCloneRef.current = null;
          }}
        >
        <div
          style={{
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
            transformOrigin: "center",
            transition: isDragging ? "none" : "transform 0.2s ease",
            filter: hdriLighting === 'warm'
              ? 'brightness(1.04) contrast(1.06) saturate(1.10) sepia(0.08)'
              : hdriLighting === 'soft'
                ? 'brightness(1.12) contrast(0.89) saturate(0.80)'
                : undefined,
            width: '100%',
            height: '100%',
          }}
          data-testid="preview-zoom-wrapper"
        >
        {selectedProductType?.id === "ombre" && selectedCategory?.id === "signature-ombre" ? (
          <SignatureOmbreRoomPreview
            panelImage={soPanelImage}
            panelCount={3}
            style={{ width: '100%', height: '100%' }}
          />
        ) : (selectedProductType?.id === "flat-embossed-vmd" || selectedProductType?.id === "wood" || selectedProductType?.id === "fabrics" || selectedProductType?.id === "ombre") ? (
          <FlatEmbossedPreview
            ref={canvasRef}
            onLoadingChange={handleLoadingChange}
            categoryId={selectedCategory?.id}
            showTpatti={showTpatti}
            panelRows={selectedCategory?.id === "fabrics-designer-textile" ? (selectedDTEmboss?.panelRows ?? null) : selectedProductType?.id === "ombre" ? (FLAT_EMBOSSED_VMT_CONFIG[selectedCategory?.id]?.panelRows ?? null) : (selectedColorCoreEmboss?.panelRows ?? null)}
            panelFallbackColor={selectedProductType?.id === "ombre" ? (selectedOmbreBaseColor?.hex ?? null) : null}
            embossUrl={
              selectedProductType?.id === "ombre"
                ? ombreEmbossBlobUrl
                : selectedCategory?.id === "wood-perforations"
                  ? woodPerfEmbossBlobUrl
                  : selectedCategory?.id === "fabrics-color-core"
                    ? (selectedColorCoreEmboss ? ccPanelBlobUrl : null)
                    : selectedCategory?.id === "fabrics-designer-textile"
                      ? (selectedDTEmboss ? dtPanelBlobUrl : null)
                      : fvpEmbossBlobUrl
            }
            // flipCenter: allow per-design override (`selectedDesign.mirror_center`) or
            // fall back to category-level `mirrorCenter` from FLAT_EMBOSSED_VMT_CONFIG.
            // Special case: Ellis groove pattern in Ombre Color Core always mirrors center.
            flipCenter={
              (selectedProductType?.id === "ombre" && selectedOmbreGroovePattern?.id === "ellis")
                ? true
                : selectedDesign?.mirror_center ??
                  (selectedCategory?.id ? FLAT_EMBOSSED_VMT_CONFIG[selectedCategory.id]?.mirrorCenter : false)
            }
            textureUrls={
              // Ombre: never uses multi-column slices
              selectedProductType?.id === "ombre"
                ? null
                // Continuous-pattern: blob URLs managed by useMultiBlobPanels
                : selectedDesign?.panel_variant === "continuous" && fvpContinuousBlobUrls?.length
                  ? fvpContinuousBlobUrls
                  : null
            }
            textureUrl={
              // Ombre Color Core: Blob URL — only 1 decoded panel in memory at a time
              selectedProductType?.id === "ombre"
                ? (ombrePanelBlobUrl ?? null)
                // Color Core: Blob URL — only 1 decoded panel in memory at a time
                : selectedCategory?.id === "fabrics-color-core"
                ? (ccPanelBlobUrl ?? null)
                // Designer Textile: Blob URL — only 1 decoded panel in memory at a time
                : selectedCategory?.id === "fabrics-designer-textile"
                ? (dtPanelBlobUrl ?? null)
                // Single-texture: blob URL managed by useBlobPanel
                : selectedDesign?.panel_variant !== "continuous"
                  ? fvpSingleBlobUrl
                  : null
            }
          />
        ) : selectedProductType?.id === "vicstrip" ? (
          <VicStripPreview
            ref={canvasRef}
            onLoadingChange={handleLoadingChange}
            textureUrl={vicstripBlobUrl}
            fallbackColor={selectedDesign?.color?.hex || "#CCCCCC"}
            designLabel={`${selectedPattern?.id || "vicstrip"}-${selectedDesign?.color?.id || "design"}`}
          />
        ) : (
          <CanvasPreview
            ref={canvasRef}
            onLoadingChange={handleLoadingChange}
            textureColor={selectedDesign?.texture_color}
            textureUrl={canvasBlobUrl}
            selectedColor={selectedColor}
            size={selectedSize}
            isEmbossed={isEmbossed}
            productType={selectedProductType?.id}
          />
        )}
        {/* HDRI Lighting overlay — angle-driven gradient layers, pointer-events-none */}
        {hdriLighting !== 'none' && (() => {
          const _rad = (lightAngle * Math.PI) / 180;
          const lx = `${(50 + Math.sin(_rad) * 65).toFixed(1)}%`;
          const ly = `${(50 - Math.cos(_rad) * 65).toFixed(1)}%`;
          const fillAngle = (lightAngle + 180) % 360;
          const shadowAngle = lightAngle;
          if (hdriLighting === 'warm') return (
            <>
              {/* Key light: warm amber from the light direction */}
              <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 100,
                background: `radial-gradient(ellipse 100% 70% at ${lx} ${ly}, rgba(255,190,55,0.26) 0%, transparent 60%)`,
                mixBlendMode: 'overlay' }} />
              {/* Fill sweep from light direction */}
              <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 100,
                background: `linear-gradient(${fillAngle}deg, rgba(255,155,30,0.10), transparent)`,
                mixBlendMode: 'soft-light' }} />
              {/* Shadow on opposite side */}
              <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 100,
                background: `linear-gradient(${shadowAngle}deg, rgba(45,18,0,0.22), transparent 50%)`,
                mixBlendMode: 'multiply' }} />
            </>
          );
          if (hdriLighting === 'soft') return (
            <>
              {/* Soft diffuse from light direction */}
              <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 100,
                background: `radial-gradient(ellipse 150% 120% at ${lx} ${ly}, rgba(220,228,255,0.20) 0%, rgba(190,205,240,0.12) 55%, transparent 100%)`,
                mixBlendMode: 'screen' }} />
              {/* Soft fill from light direction */}
              <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 100,
                background: `linear-gradient(${fillAngle}deg, rgba(230,240,255,0.08), transparent)`,
                mixBlendMode: 'screen' }} />
            </>
          );
          return null;
        })()}
        </div>

        {/* ── Magnifier loupe ─────────────────────────────────────────── */}
        {/* Always in DOM so magnifierDivRef is available on mouseenter */}
        <div
          ref={magnifierDivRef}
          aria-hidden="true"
          style={{
            display: magnifierActive && !isDragging ? 'block' : 'none',
            position: 'absolute',
            width: MAGNIFIER_SIZE,
            height: MAGNIFIER_SIZE,
            borderRadius: '50%',
            overflow: 'hidden',
            border: '2.5px solid rgba(255,255,255,0.85)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(0,0,0,0.1)',
            pointerEvents: 'none',
            zIndex: 50,
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        />
        </div>

        {/* ── Incomplete-selections note ─────────────────────────────── */}
        {selectedProductType && !isConfigComplete && (
          <div
            className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 pointer-events-none"
            data-testid="incomplete-selections-note"
          >
            <div className="flex items-center gap-2.5 bg-black/60 backdrop-blur-md rounded-xl px-5 py-2.5 shadow-xl">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span className="text-white text-[13px] font-medium tracking-wide whitespace-nowrap">
                Please fill in all selections to see the full preview.
              </span>
            </div>
          </div>
        )}

        {/* ── Selection mini cards — stacked at bottom-left of canvas area ── */}
        {selectedProductType && (() => {
          const id = selectedProductType.id;

          // Build a flat list of { label, value, color? } entries for the active config
          const entries = [];

          entries.push({ label: 'Series', value: selectedProductType.name });

          if (id === 'vicstrip') {
            if (selectedPattern) entries.push({ label: 'Pattern', value: selectedPattern.name });
            if (selectedDesign?.color) entries.push({ label: 'Color', value: selectedDesign.color.name, color: selectedDesign.color.hex });
            if (selectedSize) entries.push({ label: 'Size', value: selectedSize });
            if (selectedThickness) entries.push({ label: 'Thickness', value: selectedThickness });

          } else if (id === 'ombre') {
            if (selectedCategory) entries.push({ label: 'Category', value: selectedCategory.name });
            if (selectedCategory?.id === 'signature-ombre') {
              entries.push({ label: 'Base', value: soBaseColor, color: soBaseColor });
              entries.push({ label: 'Overlay', value: soOverlayColor, color: soOverlayColor });
              if (soSelectedPattern) entries.push({ label: 'Pattern', value: SO_PATTERNS.find(p => p.id === soSelectedPattern)?.name ?? soSelectedPattern });
            } else {
              if (selectedOmbreBaseColor) entries.push({ label: 'Base Color', value: selectedOmbreBaseColor.name, color: selectedOmbreBaseColor.hex });
              if (selectedOmbreOverlay) entries.push({ label: 'Overlay', value: selectedOmbreOverlay.hex, color: selectedOmbreOverlay.hex });
              if (selectedOmbreEmbossPattern) entries.push({ label: 'Emboss', value: selectedOmbreEmbossPattern.name });
              if (selectedOmbreGroovePattern) entries.push({ label: 'Groove', value: selectedOmbreGroovePattern.name });
              if (selectedSize) entries.push({ label: 'Size', value: selectedSize });
              if (selectedThickness) entries.push({ label: 'Thickness', value: selectedThickness });
            }

          } else if (id === 'fabrics') {
            if (selectedCategory) entries.push({ label: 'Category', value: selectedCategory.name });
            if (selectedCategory?.id === 'fabrics-color-core') {
              if (selectedColorCoreColor) entries.push({ label: 'Color', value: selectedColorCoreColor.name, color: selectedColorCoreColor.hex });
              if (selectedFabricStructure) entries.push({ label: 'Texture', value: selectedFabricStructure.name });
              if (selectedColorCoreEmboss) entries.push({ label: 'Emboss', value: selectedColorCoreEmboss.name });
              if (selectedSize) entries.push({ label: 'Size', value: selectedSize });
            } else if (selectedCategory?.id === 'fabrics-designer-textile') {
              if (selectedDTShade) entries.push({ label: 'Shade', value: `${selectedDTColorGroup?.name} · ${selectedDTShade.id.replace('_', ' ')}`, color: selectedDTShade.hex });
              if (selectedDTFabric) entries.push({ label: 'Fabric', value: selectedDTFabric.name });
              if (selectedDTEmboss) entries.push({ label: 'Emboss', value: selectedDTEmboss.name });
              if (selectedDTSize) entries.push({ label: 'Size', value: selectedDTSize });
              if (selectedThickness) entries.push({ label: 'Thickness', value: selectedThickness });
            } else {
              if (selectedDesign) entries.push({ label: 'Design', value: selectedDesign.design_name || selectedDesign.design_code });
              if (selectedSize) entries.push({ label: 'Size', value: selectedSize });
              if (selectedThickness) entries.push({ label: 'Thickness', value: selectedThickness });
              if (selectedEmbossPattern) entries.push({ label: 'Emboss', value: selectedEmbossPattern.name });
            }

          } else {
            // flat-embossed-vmd, wood, and generic
            if (selectedCategory) entries.push({ label: 'Category', value: selectedCategory.name });
            if (selectedCategory?.id === 'wood-perforations') {
              if (selectedWoodPerfSize) entries.push({ label: 'Size', value: selectedWoodPerfSize });
              if (selectedDesign) entries.push({ label: 'Print', value: selectedDesign.design_name || selectedDesign.design_code });
              if (selectedPerforation) entries.push({ label: 'Perforation', value: selectedPerforation.name });
            } else {
              if (selectedDesign) entries.push({ label: 'Design', value: selectedDesign.design_name || selectedDesign.design_code });
              if (selectedSize) entries.push({ label: 'Size', value: selectedSize });
              if (selectedThickness) entries.push({ label: 'Thickness', value: selectedThickness });
              if (selectedEmbossPattern) entries.push({ label: 'Emboss', value: selectedEmbossPattern.name });
            }
          }

          // T-Patti (relevant for categories that support it)
          if (selectedCategory?.id && FLAT_EMBOSSED_VMT_CONFIG[selectedCategory.id]?.tpatti) {
            entries.push({ label: 'T-Profile', value: showTpatti ? 'On' : 'Off' });
          }

          if (entries.length === 0) return null;

          return (
            <div
              className="absolute bottom-4 left-4 z-20 flex flex-col-reverse gap-1.5 items-start pointer-events-none"
              data-testid="selection-mini-cards"
            >
              {entries.map(({ label, value, color }) => (
                <div
                  key={label}
                  className="flex items-center gap-2 bg-white/88 backdrop-blur-sm rounded-lg px-2.5 py-1 shadow-md border border-white/40"
                  style={{ backdropFilter: 'blur(8px)' }}
                >
                  {color && (
                    <span
                      className="inline-block w-3 h-3 rounded-full flex-shrink-0 border border-black/10"
                      style={{ backgroundColor: color }}
                    />
                  )}
                  <span className="text-[10px] font-semibold text-[hsl(215,16%,50%)] uppercase tracking-wide leading-none">
                    {label}
                  </span>
                  <span className="text-[11px] font-medium text-[hsl(215,25%,27%)] leading-none max-w-[120px] truncate">
                    {value}
                  </span>
                </div>
              ))}
            </div>
          );
        })()}
      </main>

      </div>{/* end configurator-content */}

      {/* Floating chat button */}
      <button
        onClick={() => setChatOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-[300] w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-transform hover:scale-110 active:scale-95"
        style={{ background: 'hsl(7, 62%, 62%)' }}
        aria-label="Chat with us"
        data-testid="chat-fab"
      >
        <img src="/chat-icon.png" alt="Chat" className="w-11 h-11 object-contain" />
        {/* <MessageCircle className="h-6 w-6 text-white" /> */}
      </button>

      <ChatWidget open={chatOpen} onClose={() => setChatOpen(false)} />

      {showBootOverlay && (
        <div className="fixed inset-0 z-[100] bg-white flex items-center justify-center" data-testid="boot-overlay" aria-hidden="true">
          <img src="/UV-loader.png" alt="Loading..." className="uv-loader" />
        </div>
      )}
    </div>
  );
};

export default Configurator;
