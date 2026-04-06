import { useState, useEffect, useCallback, useRef, memo } from "react";
import { useRenderLog } from "@/hooks/use-render-log";
import axios from "axios";
import { toast } from "sonner";
import { Download, Heart, Trash2, RefreshCw, Shield, Flame, Leaf, Award, ZoomIn, ZoomOut, X, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import CanvasPreview from "@/components/CanvasPreview";
import FlatEmbossedPreview, { preloadImages } from "@/components/FlatEmbossedPreview";
import VicStripPreview from "@/components/VicStripPreview";
import { VICSTRIP_PRODUCT, getImagePath, getFlatEmbossedPanelPath, FLAT_EMBOSSED_VMT_CONFIG, resolveAssetUrl, FLAT_EMBOSSED_EMBOSS_PATTERNS, WOOD_PERFORATION_SIZES, WOOD_PERFORATION_PATTERNS, WOOD_PERFORATION_EXCLUSIONS, COLOR_CORE_COLORS, COLOR_CORE_FABRIC_STRUCTURES, getColorCorePanelUrl, getColorCoreThumbnailUrl, COLOR_CORE_EMBOSS_PATTERNS, COLOR_CORE_SIZES, getColorCoreEmbossUrl, OMBRE_COLOR_CORE_BASE_COLORS, OMBRE_COLOR_CORE_OVERLAYS, getOmbreColorCorePanelUrl, OMBRE_COLOR_CORE_EMBOSS_PATTERNS, getOmbreEmbossPanelUrl, OMBRE_COLOR_CORE_GROOVE_PATTERNS, getOmbreGroovePanelUrl, DESIGNER_TEXTILE_COLOR_GROUPS, DESIGNER_TEXTILE_FABRICS, DESIGNER_TEXTILE_SIZES, DESIGNER_TEXTILE_THICKNESSES, getDesignerTextileThumbnailUrl, DESIGNER_TEXTILE_EMBOSS_PATTERNS, getDesignerTextileEmbossUrl } from "@/data/skus";
import { useBlobPanel, useMultiBlobPanels } from "@/hooks/use-blob-panel";
import { downloadPanelImages } from "@/lib/downloadPanelImages";
import SignatureOmbreRoomPreview from "@/components/SignatureOmbreRoomPreview";
import SignatureOmbreLightRing from "@/components/SignatureOmbreLightRing";
import { OmbreEmbossEngine } from "@/lib/OmbreEmbossEngine";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Boot loader toggles (quickly reversible without touching JSX)
const ENABLE_BOOT_WHITE_OVERLAY = true;
const BOOT_OVERLAY_EXTRA_MS = 500;

// Interior background image (user provided)
const INTERIOR_IMAGE = "https://customer-assets.emergentagent.com/job_74835dcc-aa13-4905-afe8-adfb41a5c38e/artifacts/drq6tblo_UniVic%20Strip_AO%20Map.png";

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

const DesignThumbnail = memo(({ design, isSelected, onSelect }) => {
  const bgColor = design.texture_color || "#CCCCCC";
  const thumbUrl = resolveAssetUrl(design.thumbnail_url || design.texture_url || null);
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
            {design.category && (
              <div className="flex justify-between">
                <span className="text-[hsl(215,16%,47%)]">Category</span>
                <span className="font-medium">{design.category}</span>
              </div>
            )}
            {design.pattern && (
              <div className="flex justify-between">
                <span className="text-[hsl(215,16%,47%)]">Pattern</span>
                <span className="font-medium">{design.pattern}</span>
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
));
EmbossThumbnail.displayName = "EmbossThumbnail";

const Configurator = () => {
  // Products from API
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showBootOverlay, setShowBootOverlay] = useState(ENABLE_BOOT_WHITE_OVERLAY);
  
  // Product type selection
  const [selectedProductType, setSelectedProductType] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  
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
  const [selectedColorCoreColor, setSelectedColorCoreColor] = useState(COLOR_CORE_COLORS[0]);
  const [selectedFabricStructure, setSelectedFabricStructure] = useState(COLOR_CORE_FABRIC_STRUCTURES[0]);
  const [selectedColorCoreEmboss, setSelectedColorCoreEmboss] = useState(null);
  // Designer Textile specific state
  const [selectedDTColorGroup, setSelectedDTColorGroup] = useState(DESIGNER_TEXTILE_COLOR_GROUPS[0]);
  const [selectedDTShade, setSelectedDTShade] = useState(DESIGNER_TEXTILE_COLOR_GROUPS[0].shades[0]);
  const [selectedDTFabric, setSelectedDTFabric] = useState(DESIGNER_TEXTILE_FABRICS[0]);
  const [selectedDTSize, setSelectedDTSize] = useState(DESIGNER_TEXTILE_SIZES[0].id);
  const [selectedDTEmboss, setSelectedDTEmboss] = useState(null);
  // Ombre Color Core specific state
  const [selectedOmbreBaseColor, setSelectedOmbreBaseColor] = useState(OMBRE_COLOR_CORE_BASE_COLORS[0]);
  const [selectedOmbreOverlay, setSelectedOmbreOverlay] = useState(
    OMBRE_COLOR_CORE_OVERLAYS[OMBRE_COLOR_CORE_BASE_COLORS[0].id]?.[0] ?? null
  );
  const [selectedOmbreEmbossPattern, setSelectedOmbreEmbossPattern] = useState(null);
  const [selectedOmbreGroovePattern, setSelectedOmbreGroovePattern] = useState(null);
  const [ombreFinishType, setOmbreFinishType] = useState("emboss"); // "emboss" | "groove"
  // Signature Ombre real-time 3D configurator state
  const [soBaseColor, setSoBaseColor] = useState('#C47A4A');
  const [soOverlayColor, setSoOverlayColor] = useState('#6B3A2A');
  const [soBlend, setSoBlend] = useState(50);
  const [soLightRotation, setSoLightRotation] = useState(0);
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

  // Designer Textile — Blob URL panel manager (exactly 1 full-res image in memory)
  // When an emboss pattern is selected, the pre-rendered emboss composite replaces the base panel.
  const isDTActive = selectedCategory?.id === "fabrics-designer-textile";
  const dtPanelUrl = isDTActive
    ? (selectedDTEmboss && selectedDTFabric?.id && selectedDTShade?.id
        ? getDesignerTextileEmbossUrl(selectedDTFabric.id, selectedDTEmboss.id, selectedDTShade.id, selectedDTEmboss.filenameSuffix)
        : (selectedDTFabric?.id && selectedDTShade?.id
            ? `${BACKEND_URL}/static/images/fabric/designer_textile/panels/${selectedDTFabric.id}_${selectedDTShade.id}.jpg`
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
  const ccPanelUrl = isCCActive
    ? (selectedColorCoreEmboss
        ? getColorCoreEmbossUrl(
            selectedFabricStructure?.id ?? COLOR_CORE_FABRIC_STRUCTURES[0].id,
            selectedColorCoreEmboss.id,
            selectedColorCoreColor?.id ?? COLOR_CORE_COLORS[0].id
          )
        : getColorCorePanelUrl(
            selectedFabricStructure?.id ?? COLOR_CORE_FABRIC_STRUCTURES[0].id,
            selectedColorCoreColor?.id ?? COLOR_CORE_COLORS[0].id
          ))
    : null;
  const { blobUrl: ccPanelBlobUrl, isLoading: ccPanelLoading } = useBlobPanel(ccPanelUrl);

  // FVP single panel — flat-embossed, wood, non-CC/DT fabrics (non-continuous design)
  const fvpSingleUrl = (
    selectedProductType?.id !== "ombre" &&
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
  const ZOOM_STEP = 0.25;
  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = selectedProductType?.id === "ombre" ? 1.5 : 8.0;
  const zoomIn = () => setZoomLevel(prev => Math.min(parseFloat((prev + ZOOM_STEP).toFixed(2)), ZOOM_MAX));
  const zoomOut = () => setZoomLevel(prev => Math.max(parseFloat((prev - ZOOM_STEP).toFixed(2)), ZOOM_MIN));

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

  // Load products from API
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await axios.get(`${API}/products`);
        const apiProducts = response.data;
        setProducts(apiProducts);
        
        // Set default selection to first active product
        const firstActive = apiProducts.find(p => p.active);
        if (firstActive) {
          setSelectedProductType(firstActive);
          
          // Initialize state based on product type
          if (firstActive.id === "vicstrip") {
            // VicStrip-specific initialization
            setSelectedPattern(VICSTRIP_PRODUCT.patterns[0]);
            setSelectedDesign({ pattern: VICSTRIP_PRODUCT.patterns[0], color: VICSTRIP_PRODUCT.patterns[0].colors[0] });
            setSelectedSize("600x600");
            setSelectedThickness("12 mm");
          } else if (firstActive.id === "ombre") {
            // Ombre-specific initialization
            setSelectedOmbreBaseColor(OMBRE_COLOR_CORE_BASE_COLORS[0]);
            setSelectedOmbreOverlay(OMBRE_COLOR_CORE_OVERLAYS[OMBRE_COLOR_CORE_BASE_COLORS[0].id]?.[0] ?? null);
            setSelectedOmbreEmbossPattern(null);
            setSelectedOmbreGroovePattern(null);
            setOmbreFinishType("emboss");
            if (firstActive.sizes?.length > 0) setSelectedSize(firstActive.sizes[0]);
            if (firstActive.thicknesses?.length > 0) setSelectedThickness(firstActive.thicknesses[0]);
            if (firstActive.categories?.length > 0) setSelectedCategory(firstActive.categories[0]);
          } else {
            // Generic product initialization (VMD, Ombre, etc.)
            if (firstActive.sizes?.length > 0) setSelectedSize(firstActive.sizes[0]);
            if (firstActive.densities?.length > 0) setSelectedDensity(firstActive.densities[0]);
            if (firstActive.patterns?.length > 0) setSelectedPattern(firstActive.patterns[0]);
            if (firstActive.thicknesses?.length > 0) setSelectedThickness(firstActive.thicknesses[0]);
            if (firstActive.colors?.length > 0) setSelectedColor(firstActive.colors[0]);
            if (firstActive.categories?.length > 0) {
              setSelectedCategory(firstActive.categories[0]);
              if (firstActive.categories[0].designs?.length > 0) {
                setSelectedDesign(firstActive.categories[0].designs[0]);
              }
            }
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

  // Load tech specs when product type changes
  useEffect(() => {
    const fetchSpecs = async () => {
      if (selectedProductType?.id) {
        try {
          const response = await axios.get(`${API}/products/${selectedProductType.id}/specs`);
          setTechSpecs(response.data);
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
  const handleProductTypeChange = (productId) => {
    const product = products.find(p => p.id === productId);
    if (product && product.active) {
      setSelectedProductType(product);
      
      // Clear all state first
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
      setSelectedOmbreBaseColor(OMBRE_COLOR_CORE_BASE_COLORS[0]);
      setSelectedOmbreOverlay(OMBRE_COLOR_CORE_OVERLAYS[OMBRE_COLOR_CORE_BASE_COLORS[0].id]?.[0] ?? null);
      setSelectedOmbreEmbossPattern(null);
      setSelectedOmbreGroovePattern(null);
      setOmbreFinishType("emboss");
      
      // Reset options based on new product type
      if (product.id === "vicstrip") {
        // VicStrip-specific initialization
        const defaultPattern = VICSTRIP_PRODUCT.patterns[0];
        setSelectedPattern(defaultPattern);
        setSelectedDesign({ pattern: defaultPattern, color: defaultPattern.colors[0] });
        setSelectedSize("600x600");
        setSelectedThickness("12 mm");
      } else if (product.id === "ombre") {
        // Ombre-specific initialization
        setSelectedOmbreBaseColor(OMBRE_COLOR_CORE_BASE_COLORS[0]);
        setSelectedOmbreOverlay(OMBRE_COLOR_CORE_OVERLAYS[OMBRE_COLOR_CORE_BASE_COLORS[0].id]?.[0] ?? null);
        setSelectedOmbreEmbossPattern(null);
        setSelectedOmbreGroovePattern(null);
        setOmbreFinishType("emboss");
        if (product.sizes?.length > 0) setSelectedSize(product.sizes[0]);
        if (product.thicknesses?.length > 0) setSelectedThickness(product.thicknesses[0]);
        if (product.categories?.length > 0) setSelectedCategory(product.categories[0]);
      } else {
        // Generic product initialization
        if (product.sizes?.length > 0) setSelectedSize(product.sizes[0]);
        if (product.densities?.length > 0) setSelectedDensity(product.densities[0]);
        if (product.patterns?.length > 0) setSelectedPattern(product.patterns[0]);
        if (product.thicknesses?.length > 0) setSelectedThickness(product.thicknesses[0]);
        if (product.colors?.length > 0) setSelectedColor(product.colors[0]);
        
        if (product.categories?.length > 0) {
          setSelectedCategory(product.categories[0]);
          if (product.categories[0].designs?.length > 0) {
            setSelectedDesign(product.categories[0].designs[0]);
          }
        }
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
      // Wood Perforations: reset to blank state — size must be selected first
      if (category.id === "wood-perforations") {
        setSelectedDesign(null);
        setSelectedWoodPerfSize(null);
        setSelectedPerforation(null);
      } else if (category.id === "fabrics-color-core") {
        // Color Core: auto-select first color + structure + size
        setSelectedColorCoreColor(COLOR_CORE_COLORS[0]);
        setSelectedFabricStructure(COLOR_CORE_FABRIC_STRUCTURES[0]);
        setSelectedColorCoreEmboss(null);
        setSelectedSize("1200x2800");
        setSelectedDesign(null);
      } else if (category.id === "fabrics-designer-textile") {
        // Designer Textile: auto-select first color group, shade, fabric, size; clear emboss
        setSelectedDTColorGroup(DESIGNER_TEXTILE_COLOR_GROUPS[0]);
        setSelectedDTShade(DESIGNER_TEXTILE_COLOR_GROUPS[0].shades[0]);
        setSelectedDTFabric(DESIGNER_TEXTILE_FABRICS[0]);
        setSelectedDTSize(DESIGNER_TEXTILE_SIZES[0].id);
        setSelectedDTEmboss(null);
        setSelectedThickness(DESIGNER_TEXTILE_THICKNESSES[0]);
        setSelectedDesign(null);
      } else if (category.id === "ombre-color-core-ombre") {
        // Ombre Color Core: reset base/overlay selection
        setSelectedOmbreBaseColor(OMBRE_COLOR_CORE_BASE_COLORS[0]);
        setSelectedOmbreOverlay(OMBRE_COLOR_CORE_OVERLAYS[OMBRE_COLOR_CORE_BASE_COLORS[0].id]?.[0] ?? null);
        setSelectedOmbreEmbossPattern(null);
        setSelectedOmbreGroovePattern(null);
        setOmbreFinishType("emboss");
        setSelectedDesign(null);
      } else if (category.id === "signature-ombre") {
        // Signature Ombre: reset to defaults; engine inits via useEffect
        setSoPanelImage(null);
        setSoBaseColor('#C47A4A');
        setSoOverlayColor('#6B3A2A');
        setSoBlend(50);
        setSoLightRotation(0);
        setSoSelectedPattern(SO_PATTERNS[0].id);
        setSelectedDesign(null);
      } else if (category.designs?.length > 0) {
        setSelectedDesign(category.designs[0]);
      } else {
        setSelectedDesign(null);
      }
    }
  };

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
        setSelectedThickness(favorite.thickness || "12 mm");
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

  // Technical Specs Panel — defined outside Configurator (see below)
  // Using the module-level TechSpecsPanel component with specs passed as a prop.

  // ── placeholder so JSX below still works ──────────────────────────────────
  const techSpecsData = techSpecs || DEFAULT_SPECS[selectedProductType?.id] || {};

  if (!ENABLE_BOOT_WHITE_OVERLAY && loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="boot-loader" aria-label="Loading configurator" />
      </div>
    );
  }

  return (
    <div className="configurator-root" data-testid="configurator-page">
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
          <div>
            <h1 className="brand-logo text-xl leading-none text-[hsl(215,25%,27%)]" data-testid="brand-logo">UniVicoustic</h1>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[hsl(215,16%,47%)] mt-0.5">Acoustic Panel Configurator</p>
          </div>
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
              let pdfFile;
              if (selectedProductType?.id === "flat-embossed-vmd") {
                const isPetWool = selectedThickness === "PET Wool";
                if (selectedEmbossPattern) {
                  pdfFile = isPetWool
                    ? "Embossed VMT Series (PET WOOL).pdf"
                    : "Embossed VMT Series (PET).pdf";
                } else {
                  pdfFile = isPetWool
                    ? "Flat Panel VMT (PET WOOL).pdf"
                    : "Flat Panel VMT (PET).pdf";
                }
              } else if (selectedProductType?.id === "ombre" && selectedCategory?.id === "ombre-color-core-ombre") {
                pdfFile = selectedThickness === "25mm (PET Panel)"
                  ? "Embossed VMT Series (PET).pdf"
                  : "Flat Panel VMT (PET).pdf";
              } else {
                pdfFile = "ts_001.pdf";
              }
              window.open(`${BACKEND_URL}/tech-specs/${encodeURIComponent(pdfFile)}`, "_blank");
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
            {/* Product Type Dropdown */}
            <div className="config-section space-y-2">
              <Label className="section-header">Product Type</Label>
              <Select value={selectedProductType?.id} onValueChange={handleProductTypeChange}>
                <SelectTrigger className="w-full" data-testid="product-type-trigger">
                  <SelectValue placeholder="Select product type" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((product) => (
                    <SelectItem 
                      key={product.id} 
                      value={product.id}
                      disabled={!product.active}
                      data-testid={`product-type-${product.id}`}
                    >
                      {product.name} {!product.active && "(Coming Soon)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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
                      {VICSTRIP_PRODUCT.patterns.map((pattern) => (
                        <SelectItem key={pattern.id} value={pattern.id} data-testid={`pattern-${pattern.id}`}>
                          {pattern.name}
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
                      <Select value={selectedSize || ""} onValueChange={setSelectedSize}>
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
                          <SelectItem value="12 mm">12 mm</SelectItem>
                          <SelectItem value="25 mm">25 mm</SelectItem>
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
                        // Prefer category designs if available, otherwise fall back to pattern colors
                        const designs = (selectedCategory?.designs && selectedCategory.designs.length > 0)
                          ? selectedCategory.designs
                          : (selectedPattern?.colors || []).map((c, i) => ({
                              id: `vicstrip-color-${c.id || i}`,
                              product_type: 'vicstrip',
                              category: selectedPattern?.name,
                              design_code: `VCS-${(i+1).toString().padStart(4,'0')}`,
                              design_name: `${selectedPattern?.name} - ${c.name}`,
                              texture_color: c.hex,
                              thumbnail_url: null,
                              color_name: c.name,
                              pattern: selectedPattern?.name,
                              color: c, // Pass the full color object here
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
                {/* 1. Size */}
                {selectedProductType?.sizes?.length > 0 && selectedCategory?.id !== "wood-perforations" && selectedCategory?.id !== "fabrics-color-core" && selectedCategory?.id !== "fabrics-designer-textile" && (
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

                {/* 2. Category */}
                {selectedProductType?.categories?.length > 0 && (
                  <div className="config-section space-y-2">
                    <Label className="section-header">Category</Label>
                    <Select value={selectedCategory?.id} onValueChange={handleCategoryChange} data-testid="category-select">
                      <SelectTrigger className="w-full" data-testid="category-trigger">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedProductType.categories.map((category) => (
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

                {/* 2b. Size — only for Wood Perforations (category-level, gates the print grid) */}
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

                    {/* Color Core: Base Color swatches */}
                    <div className="config-section space-y-2">
                      <Label className="section-header">Base Color</Label>
                      <div className="grid grid-cols-5 gap-2">
                        {COLOR_CORE_COLORS.map((color) => (
                          <button
                            key={color.id}
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

                    {/* Color Core: Emboss */}
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

                    {/* Designer Textile: 2. Color — all groups + shades in one compact card */}
                    <div className="config-section space-y-3">
                      <Label className="section-header">Color</Label>
                      {DESIGNER_TEXTILE_COLOR_GROUPS.map((group) => (
                        <div key={group.id}>
                          <p className="text-[10px] font-semibold text-[hsl(215,16%,47%)] uppercase tracking-wider mb-1.5">{group.name}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {group.shades.map((shade) => (
                              <button
                                key={shade.id}
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

                    {/* Designer Textile: 3. Fabric Texture — live thumbnails, cannot unselect */}
                    <div className="config-section space-y-2">
                      <Label className="section-header">Fabric Texture</Label>
                      <div className="grid grid-cols-3 gap-2" data-testid="dt-fabric-grid">
                        {DESIGNER_TEXTILE_FABRICS
                          .filter(f => !selectedDTColorGroup || f.supportedColorGroups.includes(selectedDTColorGroup.id))
                          .map((fabric) => {
                            const isSelected = selectedDTFabric?.id === fabric.id;
                            return (
                              <button
                                key={fabric.id}
                                title={fabric.name}
                                onClick={() => setSelectedDTFabric(fabric)}
                                className={`relative aspect-square rounded overflow-hidden border-2 transition-colors ${
                                  isSelected ? "border-[hsl(30,40%,46%)]" : "border-transparent hover:border-[hsl(215,16%,47%)]"
                                }`}
                                data-testid={`dt-fabric-${fabric.id}`}
                              >
                                <img
                                  src={getDesignerTextileThumbnailUrl(fabric.id, selectedDTShade?.id)}
                                  alt={fabric.name}
                                  className="absolute inset-0 w-full h-full object-cover"
                                />
                                <span className="absolute bottom-0 left-0 right-0 text-[10px] text-center font-semibold text-white bg-black/40 py-0.5">
                                  {fabric.name}
                                </span>
                              </button>
                            );
                          })
                        }
                      </div>
                      {selectedDTFabric && (
                        <p className="text-xs text-[hsl(215,16%,47%)] pt-0.5">{selectedDTFabric.name} selected</p>
                      )}
                    </div>

                    {/* Designer Textile: 4. Thickness */}
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

                    {/* Designer Textile: 5. Emboss */}
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
                  </>
                ) : selectedCategory?.designs?.length > 0 ? (
                  selectedCategory.id === "wood-perforations" && !selectedWoodPerfSize ? (
                    <div className="config-section">
                      <p className="section-header mb-1">Print</p>
                      <p className="text-sm text-[hsl(215,16%,47%)]">Select a size above to view available prints.</p>
                    </div>
                  ) : (
                  <Accordion type="single" collapsible defaultValue="print" className="config-accordion-wrapper">
                    <AccordionItem value="print" className="border-0 px-4">
                      <AccordionTrigger className="section-header py-3">Print</AccordionTrigger>
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
                  </Accordion>
                  )
                ) : null}

                {/* 4. Emboss — shown for emboss-enabled categories; hidden if selected design has no emboss */}
                {selectedCategory?.emboss_available && selectedCategory?.id !== "fabrics-color-core" && selectedCategory?.id !== "fabrics-designer-textile" && (() => {
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

                {/* 5. Thickness */}
                {selectedProductType?.thicknesses?.length > 0 && selectedCategory?.id !== "fabrics-designer-textile" && (
                  <div className="config-section space-y-2">
                    <Label className="section-header">Thickness</Label>
                    <Select value={selectedThickness || ""} onValueChange={setSelectedThickness} data-testid="thickness-select">
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
              </div>
            )}

            {/* ── Ombre Options ─────────────────────────────────────────────── */}
            {selectedProductType?.id === "ombre" && (
              <div className="flex flex-col">
                {/* 0. Category */}
                {selectedProductType?.categories?.length > 0 && (
                  <div className="config-section space-y-2">
                    <Label className="section-header">Category</Label>
                    <Select value={selectedCategory?.id ?? ""} onValueChange={handleCategoryChange} data-testid="ombre-category-select">
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedProductType.categories.map((cat) => (
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
                  </>
                ) : (
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

                {/* 2. Base Colors */}
                <div className="config-section space-y-2">
                  <Label className="section-header">Base Color</Label>
                  <div className="grid grid-cols-5 gap-2">
                    {OMBRE_COLOR_CORE_BASE_COLORS.map((color) => (
                      <button
                        key={color.id}
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
                        <button
                          key={overlay.filename}
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

                  {/* Segmented toggle: Emboss | Groove */}
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

                {/* 5. Thickness */}
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
                  </>
                )}
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
      </aside>

      {/* Canvas Preview Area */}
      <main className="canvas-area" data-testid="canvas-area">

        {/* Zoom Controls */}
        <div className="absolute bottom-4 right-4 flex flex-col gap-1 z-10" data-testid="zoom-controls">
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
        <div className="rounded-3xl overflow-hidden shadow-lg inset-shadow-lg inset-shadow-indigo-500/100"
          style={{
            transform: `scale(${zoomLevel})`,
            transformOrigin: "center",
            transition: "transform 0.2s ease",
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
            flipCenter={
              selectedDesign?.mirror_center ??
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
            backgroundImage={INTERIOR_IMAGE}
            textureColor={selectedDesign?.texture_color}
            textureUrl={canvasBlobUrl}
            selectedColor={selectedColor}
            size={selectedSize}
            isEmbossed={isEmbossed}
            productType={selectedProductType?.id}
          />
        )}
        </div>

        {/* Configuration Summary - float*/ }
        {/* {selectedProductType && (
          <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg p-3 shadow-lg max-w-xs z-[20]" data-testid="config-summary">
            <p className="font-manrope font-bold text-sm text-[hsl(215,25%,27%)]">
              {selectedProductType?.id === "vicstrip"
                ? (selectedPattern?.name || "Select a pattern")
                : selectedProductType?.id === "ombre"
                  ? (selectedOmbreBaseColor?.name || "Select a base color")
                  : (selectedDesign?.design_name || "Select a design")}
            </p>
            <p className="text-xs text-[hsl(215,16%,47%)] mt-1">
              {selectedProductType?.id === "vicstrip"
                ? (selectedDesign?.color?.name 
                  ? `${selectedDesign?.color?.name} • ${selectedDesign?.color?.hex} • ${selectedSize} • ${selectedThickness}`
                  : "Select a color")
                : selectedProductType?.id === "ombre"
                  ? [selectedOmbreBaseColor?.name, selectedOmbreOverlay?.hex && `Overlay ${selectedOmbreOverlay.hex}`, selectedSize, selectedThickness].filter(Boolean).join(" • ")
                  : [selectedSize, selectedDensity, selectedThickness, selectedEmbossPattern?.name && `Emboss: ${selectedEmbossPattern.name}`].filter(Boolean).join(" • ")}
            </p>
          </div>
        )} */}
      </main>

      </div>{/* end configurator-content */}

      {showBootOverlay && (
        <div className="fixed inset-0 z-[100] bg-white flex items-center justify-center" data-testid="boot-overlay" aria-hidden="true">
          <div className="boot-loader" aria-label="Loading configurator" />
        </div>
      )}
    </div>
  );
};

export default Configurator;
