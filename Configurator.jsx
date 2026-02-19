import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Download, Heart, Trash2, RefreshCw, Loader2, Eye, X, Shield, Flame, Leaf, Award } from "lucide-react";
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

const Configurator = () => {
  const [products, setProducts] = useState([]);
  const [selectedProductType, setSelectedProductType] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedDesign, setSelectedDesign] = useState(null);
  const [selectedSize, setSelectedSize] = useState(null);
  const [selectedDensity, setSelectedDensity] = useState(null);
  const [selectedPattern, setSelectedPattern] = useState(null);
  const [selectedColor, setSelectedColor] = useState(null);
  const [selectedThickness, setSelectedThickness] = useState(null);
  const [isEmbossed, setIsEmbossed] = useState(false);
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [specsOpen, setSpecsOpen] = useState(false);
  const [techSpecs, setTechSpecs] = useState(null);
  const canvasRef = useRef(null);

  // Load products from API
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await axios.get(`${API}/products`);
        setProducts(response.data);
        // Set default selection to first active product
        const firstActive = response.data.find(p => p.active);
        if (firstActive) {
          setSelectedProductType(firstActive);
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
      setSelectedCategory(null);
      setSelectedDesign(null);
      setIsEmbossed(false);
      
      // Reset options based on new product type
      if (product.sizes?.length > 0) setSelectedSize(product.sizes[0]);
      else setSelectedSize(null);
      
      if (product.densities?.length > 0) setSelectedDensity(product.densities[0]);
      else setSelectedDensity(null);
      
      if (product.patterns?.length > 0) setSelectedPattern(product.patterns[0]);
      else setSelectedPattern(null);
      
      if (product.thicknesses?.length > 0) setSelectedThickness(product.thicknesses[0]);
      else setSelectedThickness(null);
      
      if (product.colors?.length > 0) setSelectedColor(product.colors[0]);
      else setSelectedColor(null);
      
      if (product.categories?.length > 0) {
        setSelectedCategory(product.categories[0]);
        if (product.categories[0].designs?.length > 0) {
          setSelectedDesign(product.categories[0].designs[0]);
        }
      }
    }
  };

  // Handle category change
  const handleCategoryChange = (categoryId) => {
    const category = selectedProductType?.categories?.find(c => c.id === categoryId);
    if (category) {
      setSelectedCategory(category);
      setIsEmbossed(false);
      if (category.designs?.length > 0) {
        setSelectedDesign(category.designs[0]);
      } else {
        setSelectedDesign(null);
      }
    }
  };

  // Handle design selection
  const handleDesignSelect = (design) => {
    setSelectedDesign(design);
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
      category: selectedCategory?.name,
      categoryId: selectedCategory?.id,
      design: selectedDesign,
      size: selectedSize,
      density: selectedDensity,
      pattern: selectedPattern,
      color: selectedColor,
      thickness: selectedThickness,
      isEmbossed: isEmbossed,
    };

    const newFavorites = [...favorites, config];
    saveFavorites(newFavorites);
    toast.success("Design saved to favorites!");
  };

  // Load favorite configuration
  const loadFavorite = (favorite) => {
    const product = products.find(p => p.id === favorite.productTypeId);
    if (product) {
      setSelectedProductType(product);
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

  // Design Thumbnail with Hover Card
  const DesignThumbnail = ({ design, isSelected, onSelect }) => {
    const bgColor = design.texture_color || "#CCCCCC";
    
    return (
      <HoverCard openDelay={200} closeDelay={100}>
        <HoverCardTrigger asChild>
          <div
            className={`thumbnail-item ${isSelected ? 'selected' : ''}`}
            style={{ backgroundColor: bgColor }}
            onClick={() => onSelect(design)}
            data-testid={`design-thumbnail-${design.id}`}
          />
        </HoverCardTrigger>
        <HoverCardContent side="right" align="start" className="w-72 p-0 overflow-hidden" data-testid={`design-hover-${design.id}`}>
          {/* Expanded texture preview */}
          <div 
            className="h-32 w-full"
            style={{ backgroundColor: bgColor }}
          />
          {/* Design info */}
          <div className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-manrope font-bold text-sm">{design.design_name}</span>
            </div>
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
            {/* Color swatch */}
            <div className="flex items-center gap-2 pt-2 border-t">
              <div 
                className="w-6 h-6 rounded border"
                style={{ backgroundColor: bgColor }}
              />
              <span className="text-xs text-[hsl(215,16%,47%)]">{bgColor}</span>
            </div>
          </div>
        </HoverCardContent>
      </HoverCard>
    );
  };

  // Technical Specs Panel
  const TechSpecsPanel = () => {
    const specs = techSpecs || DEFAULT_SPECS[selectedProductType?.id] || {};
    
    return (
      <div className="space-y-6" data-testid="tech-specs-panel">
        {/* Fire Rating */}
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-red-50">
            <Flame className="h-5 w-5 text-red-500" />
          </div>
          <div>
            <h4 className="font-manrope font-bold text-sm">Fire Rating</h4>
            <p className="text-sm text-[hsl(215,16%,47%)]">{specs.fire_rating || "N/A"}</p>
          </div>
        </div>

        {/* NRC Rating */}
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

        {/* Material */}
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

        {/* Thickness & Weight */}
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

        {/* Sustainability */}
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-green-50">
            <Leaf className="h-5 w-5 text-green-500" />
          </div>
          <div className="flex-1">
            <h4 className="font-manrope font-bold text-sm">Sustainability</h4>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {(specs.sustainability || []).map((item, i) => (
                <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Certifications */}
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-amber-50">
            <Award className="h-5 w-5 text-amber-500" />
          </div>
          <div className="flex-1">
            <h4 className="font-manrope font-bold text-sm">Certifications</h4>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {(specs.certifications || []).map((item, i) => (
                <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Installation & Warranty */}
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
    );
  };

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
            {/* Product Type Selector */}
            <div className="space-y-2">
              <Label className="section-header">Product Type</Label>
              <Select 
                value={selectedProductType?.id} 
                onValueChange={handleProductTypeChange}
                data-testid="product-type-select"
              >
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

            {/* Dynamic Options based on Product Type */}
            <Accordion type="multiple" defaultValue={["category", "options", "designs"]} className="space-y-2">
              {/* Category Selector */}
              {selectedProductType?.categories?.length > 0 && (
                <AccordionItem value="category" className="border rounded-lg px-4">
                  <AccordionTrigger className="section-header py-3">
                    {selectedProductType?.id === "vicstrip" ? "Pattern" : "Category"}
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
                        value={selectedSize} 
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
                        value={selectedDensity} 
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

                  {/* Thickness (VicStrip) */}
                  {selectedProductType?.thicknesses?.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Thickness</Label>
                      <Select 
                        value={selectedThickness} 
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

              {/* Color Swatches (VicStrip) */}
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
                <DialogTitle className="font-manrope">Saved Designs</DialogTitle>
              </DialogHeader>
              {favorites.length === 0 ? (
                <div className="py-12 text-center text-[hsl(215,16%,47%)]">
                  <Heart className="h-12 w-12 mx-auto mb-4 opacity-30" />
                  <p>No saved designs yet</p>
                  <p className="text-sm mt-1">Save your favorite configurations to access them later</p>
                </div>
              ) : (
                <ScrollArea className="max-h-[60vh]">
                  <div className="favorites-grid p-1">
                    {favorites.map((favorite) => (
                      <div
                        key={favorite.id}
                        className="favorite-card"
                        onClick={() => loadFavorite(favorite)}
                        data-testid={`favorite-card-${favorite.id}`}
                      >
                        <div 
                          className="aspect-video"
                          style={{ backgroundColor: favorite.design?.texture_color || "#CCCCCC" }}
                        />
                        <div className="p-3">
                          <p className="font-medium text-sm truncate">{favorite.design?.design_name}</p>
                          <p className="text-xs text-[hsl(215,16%,47%)] truncate">{favorite.productType}</p>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-xs text-[hsl(215,16%,47%)]">
                              {new Date(favorite.timestamp).toLocaleDateString()}
                            </span>
                            <button
                              onClick={(e) => deleteFavorite(favorite.id, e)}
                              className="p-1 hover:bg-red-100 rounded text-red-500"
                              data-testid={`delete-favorite-${favorite.id}`}
                            >
                              <Trash2 className="h-3 w-3" />
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
            Save Design
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
                  <p className="text-sm text-[hsl(215,16%,47%)]">{selectedDesign?.design_name}</p>
                </div>
                <TechSpecsPanel />
              </div>
            </SheetContent>
          </Sheet>
        )}

        {/* Canvas Component */}
        <CanvasPreview
          ref={canvasRef}
          backgroundImage={INTERIOR_IMAGE}
          textureColor={selectedDesign?.texture_color}
          textureUrl={selectedDesign?.texture_url}
          selectedColor={selectedColor}
          size={selectedSize}
          isEmbossed={isEmbossed}
          productType={selectedProductType?.id}
        />

        {/* Configuration Summary */}
        <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg p-3 shadow-lg max-w-xs" data-testid="config-summary">
          <p className="font-manrope font-bold text-sm text-[hsl(215,25%,27%)]">
            {selectedDesign?.design_name || "Select a design"}
          </p>
          <p className="text-xs text-[hsl(215,16%,47%)] mt-1">
            {[selectedSize, selectedDensity, selectedThickness, isEmbossed && "Embossed"].filter(Boolean).join(" • ")}
          </p>
        </div>
      </main>
    </div>
  );
};

export default Configurator;
