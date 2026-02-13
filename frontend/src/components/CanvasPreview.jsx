import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle, useState } from "react";
import { Loader2 } from "lucide-react";

const CanvasPreview = forwardRef(({ 
  backgroundImage, 
  textureUrl, 
  selectedColor, 
  size, 
  isEmbossed,
  productType 
}, ref) => {
  const canvasRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [bgLoaded, setBgLoaded] = useState(false);
  const bgImageRef = useRef(null);
  const textureImageRef = useRef(null);

  // Wall mask area (percentage of canvas where wall texture is applied)
  // This defines the wall area in the interior image
  const WALL_MASK = {
    x: 0.05,      // Start from 5% from left
    y: 0.02,      // Start from 2% from top
    width: 0.90,  // 90% width
    height: 0.62  // 62% height (up to furniture)
  };

  // Parse size to get tile dimensions
  const getTileDimensions = useCallback(() => {
    if (!size) return { width: 100, height: 100 };
    const [w, h] = size.split('x').map(Number);
    // Scale down for canvas (actual mm to canvas pixels ratio)
    const scale = 0.08;
    return { width: w * scale, height: h * scale };
  }, [size]);

  // Load background image
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      bgImageRef.current = img;
      setBgLoaded(true);
      setLoading(false);
    };
    img.onerror = () => {
      console.error("Failed to load background image");
      setLoading(false);
    };
    img.src = backgroundImage;
  }, [backgroundImage]);

  // Load texture image
  useEffect(() => {
    if (!textureUrl) {
      textureImageRef.current = null;
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      textureImageRef.current = img;
      renderCanvas();
    };
    img.onerror = () => {
      console.error("Failed to load texture image");
      textureImageRef.current = null;
    };
    img.src = textureUrl;
  }, [textureUrl]);

  // Render canvas
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bgLoaded) return;

    const ctx = canvas.getContext("2d");
    const bgImg = bgImageRef.current;
    const textureImg = textureImageRef.current;

    // Set canvas size based on background image aspect ratio
    const containerWidth = canvas.parentElement?.clientWidth || 800;
    const containerHeight = canvas.parentElement?.clientHeight || 600;
    
    // Calculate dimensions to fit container while maintaining aspect ratio
    const bgAspect = bgImg.width / bgImg.height;
    const containerAspect = containerWidth / containerHeight;
    
    let canvasWidth, canvasHeight;
    if (bgAspect > containerAspect) {
      canvasWidth = containerWidth;
      canvasHeight = containerWidth / bgAspect;
    } else {
      canvasHeight = containerHeight;
      canvasWidth = containerHeight * bgAspect;
    }

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    // Clear canvas
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Calculate wall area
    const wallX = canvasWidth * WALL_MASK.x;
    const wallY = canvasHeight * WALL_MASK.y;
    const wallWidth = canvasWidth * WALL_MASK.width;
    const wallHeight = canvasHeight * WALL_MASK.height;

    // Draw texture on wall area first (if available)
    if (textureImg) {
      ctx.save();
      
      // Create clipping region for wall
      ctx.beginPath();
      ctx.rect(wallX, wallY, wallWidth, wallHeight);
      ctx.clip();

      const tileDims = getTileDimensions();
      
      // Apply color overlay for VicStrip panels
      if (productType === "vicstrip" && selectedColor) {
        // Fill with selected color first
        ctx.fillStyle = selectedColor;
        ctx.fillRect(wallX, wallY, wallWidth, wallHeight);
        
        // Draw texture with multiply blend mode for slatted effect
        ctx.globalCompositeOperation = "multiply";
      }

      // Tile the texture across the wall
      const patternCanvas = document.createElement("canvas");
      const patternCtx = patternCanvas.getContext("2d");
      patternCanvas.width = tileDims.width;
      patternCanvas.height = tileDims.height;
      patternCtx.drawImage(textureImg, 0, 0, tileDims.width, tileDims.height);

      const pattern = ctx.createPattern(patternCanvas, "repeat");
      ctx.fillStyle = pattern;
      ctx.fillRect(wallX, wallY, wallWidth, wallHeight);

      // Add emboss effect if enabled
      if (isEmbossed) {
        ctx.globalCompositeOperation = "overlay";
        ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
        ctx.fillRect(wallX, wallY, wallWidth, wallHeight);
        
        // Add subtle shadow for depth
        ctx.globalCompositeOperation = "multiply";
        ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
        ctx.fillRect(wallX + 2, wallY + 2, wallWidth, wallHeight);
      }

      ctx.restore();
    } else if (selectedColor && productType === "vicstrip") {
      // Just fill with color if no texture but color is selected
      ctx.save();
      ctx.beginPath();
      ctx.rect(wallX, wallY, wallWidth, wallHeight);
      ctx.clip();
      ctx.fillStyle = selectedColor;
      ctx.fillRect(wallX, wallY, wallWidth, wallHeight);
      ctx.restore();
    }

    // Draw background image on top with wall area transparent
    ctx.save();
    
    // Draw the full background
    ctx.drawImage(bgImg, 0, 0, canvasWidth, canvasHeight);
    
    // Cut out the wall area to show texture beneath
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "rgba(0, 0, 0, 1)";
    ctx.fillRect(wallX, wallY, wallWidth, wallHeight);
    
    ctx.restore();

    // Now draw texture in the cut-out area
    if (textureImg || (selectedColor && productType === "vicstrip")) {
      ctx.save();
      ctx.globalCompositeOperation = "destination-over";
      
      ctx.beginPath();
      ctx.rect(wallX, wallY, wallWidth, wallHeight);
      ctx.clip();

      if (productType === "vicstrip" && selectedColor) {
        ctx.fillStyle = selectedColor;
        ctx.fillRect(wallX, wallY, wallWidth, wallHeight);
        
        if (textureImg) {
          ctx.globalCompositeOperation = "source-over";
          const tileDims = getTileDimensions();
          const patternCanvas = document.createElement("canvas");
          const patternCtx = patternCanvas.getContext("2d");
          patternCanvas.width = tileDims.width;
          patternCanvas.height = tileDims.height;
          patternCtx.drawImage(textureImg, 0, 0, tileDims.width, tileDims.height);
          const pattern = ctx.createPattern(patternCanvas, "repeat");
          ctx.globalAlpha = 0.7;
          ctx.fillStyle = pattern;
          ctx.fillRect(wallX, wallY, wallWidth, wallHeight);
        }
      } else if (textureImg) {
        const tileDims = getTileDimensions();
        const patternCanvas = document.createElement("canvas");
        const patternCtx = patternCanvas.getContext("2d");
        patternCanvas.width = tileDims.width;
        patternCanvas.height = tileDims.height;
        patternCtx.drawImage(textureImg, 0, 0, tileDims.width, tileDims.height);
        const pattern = ctx.createPattern(patternCanvas, "repeat");
        ctx.fillStyle = pattern;
        ctx.fillRect(wallX, wallY, wallWidth, wallHeight);
        
        if (isEmbossed) {
          ctx.globalCompositeOperation = "source-over";
          ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
          ctx.fillRect(wallX, wallY, wallWidth, wallHeight);
        }
      }
      
      ctx.restore();
    }

  }, [bgLoaded, selectedColor, size, isEmbossed, productType, getTileDimensions]);

  // Re-render when dependencies change
  useEffect(() => {
    renderCanvas();
  }, [renderCanvas, selectedColor, size, isEmbossed]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      renderCanvas();
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [renderCanvas]);

  // Expose download function to parent
  useImperativeHandle(ref, () => ({
    downloadImage: () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Create a temporary link element
      const link = document.createElement("a");
      link.download = `univicoustic-design-${Date.now()}.png`;
      link.href = canvas.toDataURL("image/png", 1.0);
      link.click();
    }
  }));

  return (
    <div className="relative w-full h-full flex items-center justify-center p-4" data-testid="canvas-container">
      {loading && (
        <div className="loading-overlay" data-testid="canvas-loading">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-[hsl(24,95%,53%)] mx-auto mb-2" />
            <p className="text-white/70 text-sm">Loading preview...</p>
          </div>
        </div>
      )}
      <canvas
        ref={canvasRef}
        className="max-w-full max-h-full shadow-2xl rounded-lg"
        data-testid="preview-canvas"
      />
    </div>
  );
});

CanvasPreview.displayName = "CanvasPreview";

export default CanvasPreview;
