import { useState, useEffect, useCallback, useRef, memo } from "react";
import { useRenderLog } from "@/hooks/use-render-log";
import axios from "axios";
import { toast } from "sonner";
import { Download, Heart, Trash2, RefreshCw, Eye, Loader2, Shield, Flame, Leaf, Award } from "lucide-react";
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
import FlatEmbossedPreview from "@/components/FlatEmbossedPreview";
import { VICSTRIP_PRODUCT, getImagePath, getFlatEmbossedPanelPath, FLAT_EMBOSSED_VMT_CONFIG } from "@/data/skus";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Interior background image (user provided)
const INTERIOR_IMAGE = "https://customer-assets.emergentagent.com/job_74835dcc-aa13-4905-afe8-adfb41a5c38e/artifacts/drq6tblo_UniVic%20Strip_AO%20Map.png";

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
  "colored-hd-ombre": {
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
  const thumbUrl = design.thumbnail_url || design.texture_url || null;
  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <div
          className={`thumbnail-item ${isSelected ? "selected" : ""}`}
          style={{
            backgroundColor: bgColor,
            backgroundImage: thumbUrl ? `url(${thumbUrl})` : undefined,
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
            backgroundImage: thumbUrl ? `url(${thumbUrl})` : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="p-4 space-y-2">
          <span className="font-manrope font-bold text-sm">{design.design_name}</span>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-[hsl(215,16%,47%)]">Product Code</span>
              <span className="font-mono font-medium">{design.design_code}</span>
            </div>
            {design.color_name && (
              <div className="flex justify-between">
                <span className="text-[hsl(215,16%,47%)]">Color</span>
                <span className="font-medium">{design.color_name}</span>
              </div>
            )}
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
            <div className="w-6 h-6 rounded border" style={{ backgroundColor: bgColor }} />
            <span className="text-xs text-[hsl(215,16%,47%)]">{bgColor}</span>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
});
DesignThumbnail.displayName = "DesignThumbnail";

const Configurator = () => {
  // Products from API
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  
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
  const [isEmbossed, setIsEmbossed] = useState(false);
  const [showTpatti, setShowTpatti] = useState(false);
  
  // UI state
  const [favorites, setFavorites] = useState([]);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [specsOpen, setSpecsOpen] = useState(false);
  const [techSpecs, setTechSpecs] = useState(null);
  const canvasRef = useRef(null);

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
    specsOpen,
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
      setShowTpatti(false);
      setSelectedPattern(null);
      setSelectedColor(null);
      setSelectedDensity(null);
      setSelectedSize(null);
      setSelectedThickness(null);
      
      // Reset options based on new product type
      if (product.id === "vicstrip") {
        // VicStrip-specific initialization
        const defaultPattern = VICSTRIP_PRODUCT.patterns[0];
        setSelectedPattern(defaultPattern);
        setSelectedDesign({ pattern: defaultPattern, color: defaultPattern.colors[0] });
        setSelectedSize("600x600");
        setSelectedThickness("12 mm");
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
      setShowTpatti(false);
      if (category.designs?.length > 0) {
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
      setSelectedDesign(designOrColor);
    }
  };

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-[hsl(24,95%,53%)] mx-auto mb-4" />
          <p className="text-[hsl(215,16%,47%)]">Loading configurator...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="configurator-layout" data-testid="configurator-page">
      {/* Sidebar */}
      <aside className="config-sidebar" data-testid="config-sidebar">
        <div className="p-6 border-b border-[hsl(var(--border))]">
          <h1 className="brand-logo text-2xl text-[hsl(215,25%,27%)]" data-testid="brand-logo">
            Uni<span className="text-[hsl(24,95%,53%)]">Vic</span>oustic
          </h1>
          <p className="text-sm text-[hsl(215,16%,47%)] mt-1">Acoustic Panel Configurator</p>
        </div>

        <ScrollArea className="h-[calc(100vh-200px)] md:h-[calc(100vh-180px)]">
          <div className="p-6 space-y-6">
            {/* Product Type Dropdown */}
            <div className="border rounded-lg px-4 py-3 space-y-2">
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
              <div className="space-y-4">
                {/* Pattern Selection */}
                <div className="border rounded-lg px-4 py-3 space-y-2">
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
                <div className="border rounded-lg px-4 py-3 space-y-2">
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
                <div className="border rounded-lg px-4 py-3 space-y-2">
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
            
            {/* Generic Product Options (VMD, Ombre, etc.) */}
            {selectedProductType?.id !== "vicstrip" && (
              <Accordion type="multiple" defaultValue={["category", "options", "designs"]} className="space-y-2">
                {/* Category Selector */}
                {selectedProductType?.categories?.length > 0 && (
                  <AccordionItem value="category" className="border rounded-lg px-4">
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
                            T-Patti Overlay
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
                <AccordionItem value="options" className="border rounded-lg px-4">
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
                  <AccordionItem value="colors" className="border rounded-lg px-4">
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
                  <AccordionItem value="designs" className="border rounded-lg px-4">
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
                  <span className="absolute -top-1 -right-1 h-5 w-5 bg-[hsl(24,95%,53%)] text-white text-xs rounded-full flex items-center justify-center">
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
        {/* Overlay Actions */}
        <div className="canvas-overlay">
          <Button
            onClick={saveToFavorites}
            className="bg-[hsl(24,95%,53%)] hover:bg-[hsl(24,95%,45%)] text-white shadow-lg"
            data-testid="save-favorite-btn"
          >
            <Heart className="h-4 w-4 mr-2" />
            Save
          </Button>
          <Button
            onClick={downloadImage}
            className="bg-[hsl(215,25%,27%)] hover:bg-[hsl(215,25%,20%)] text-white shadow-lg"
            data-testid="download-btn"
          >
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
        </div>


        {/* Technical Specs Button */}
        {selectedDesign && (
          <Sheet open={specsOpen} onOpenChange={setSpecsOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/90 backdrop-blur-sm shadow-lg hover:bg-white z-10"
                data-testid="specs-btn"
              >
                <Eye className="h-5 w-5 text-[hsl(215,25%,27%)]" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[340px] sm:w-[400px]" data-testid="specs-sheet">
              <SheetHeader>
                <SheetTitle className="font-manrope">Technical Specifications</SheetTitle>
              </SheetHeader>
              <div className="mt-6">
                <div className="mb-4 p-3 rounded-lg bg-[hsl(var(--secondary))]">
                  <p className="font-manrope font-bold">{selectedProductType?.name}</p>
                  <p className="text-sm text-[hsl(215,16%,47%)]">
                    {selectedProductType?.id === "vicstrip"
                      ? `${selectedPattern?.name} - ${selectedDesign?.color?.name}`
                      : selectedDesign?.design_name}
                  </p>
                </div>
                <TechSpecsPanel specs={techSpecsData} />
              </div>
            </SheetContent>
          </Sheet>
        )}

        {/* Canvas Component — switches between CSS-layer and HTML5 canvas per product type */}
        {selectedProductType?.id === "flat-embossed-vmd" ? (
          <FlatEmbossedPreview
            ref={canvasRef}
            categoryId={selectedCategory?.id}
            showTpatti={showTpatti}
            textureUrl={
              selectedDesign?.texture_url ||
              (selectedDesign?.design_code && selectedCategory?.id
                ? getFlatEmbossedPanelPath(selectedCategory.id, selectedDesign.design_code)
                : null)
            }
          />
        ) : (
          <CanvasPreview
            ref={canvasRef}
            backgroundImage={INTERIOR_IMAGE}
            textureColor={
              selectedProductType?.id === "vicstrip"
                ? (selectedDesign?.color?.hex || selectedDesign?.texture_color)
                : (selectedDesign?.texture_color)
            }
            textureUrl={
              selectedProductType?.id === "vicstrip"
                ? (selectedPattern?.id && selectedDesign?.color?.id ? getImagePath(selectedPattern.id, selectedDesign.color.id) : null)
                : (selectedDesign?.texture_url)
            }
            selectedColor={
              selectedProductType?.id === "vicstrip"
                ? (selectedDesign?.color?.hex || selectedDesign?.texture_color)
                : (selectedColor)
            }
            size={selectedSize}
            isEmbossed={isEmbossed}
            productType={selectedProductType?.id}
          />
        )}

        {/* Configuration Summary */}
        {selectedProductType && (
          <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg p-3 shadow-lg max-w-xs" data-testid="config-summary">
            <p className="font-manrope font-bold text-sm text-[hsl(215,25%,27%)]">
              {selectedProductType?.id === "vicstrip"
                ? (selectedPattern?.name || "Select a pattern")
                : (selectedDesign?.design_name || "Select a design")}
            </p>
            <p className="text-xs text-[hsl(215,16%,47%)] mt-1">
              {selectedProductType?.id === "vicstrip"
                ? (selectedDesign?.color?.name 
                  ? `${selectedDesign?.color?.name} • ${selectedDesign?.color?.hex} • ${selectedSize} • ${selectedThickness}`
                  : "Select a color")
                : [selectedSize, selectedDensity, selectedThickness, isEmbossed && "Embossed"].filter(Boolean).join(" • ")}
            </p>
          </div>
        )}
      </main>
    </div>
  );
};

export default Configurator;
