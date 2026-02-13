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
  // This defines the wall area in the interior image - adjust based on the provided image
  const WALL_MASK = {
    x: 0.0,       // Start from left edge
    y: 0.0,       // Start from top
    width: 1.0,   // Full width
    height: 0.58  // Up to where furniture starts
  };

  // Parse size to get tile dimensions
  const getTileDimensions = useCallback(() => {
    if (!size) return { width: 80, height: 80 };
    const [w, h] = size.split('x').map(Number);
    // Scale down for canvas (actual mm to canvas pixels ratio)
    const scale = 0.1;
    return { width: Math.max(w * scale, 60), height: Math.max(h * scale, 60) };
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
      setBgLoaded(true); // Allow rendering even without bg
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
      renderCanvas();
    };
    img.src = textureUrl;
  }, [textureUrl]);

  // Render canvas
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const bgImg = bgImageRef.current;
    const textureImg = textureImageRef.current;

    // Set canvas size based on container
    const containerWidth = canvas.parentElement?.clientWidth || 900;
    const containerHeight = canvas.parentElement?.clientHeight || 600;
    
    // Use a fixed aspect ratio for consistency
    const targetAspect = 16 / 9;
    let canvasWidth, canvasHeight;
    
    if (containerWidth / containerHeight > targetAspect) {
      canvasHeight = Math.min(containerHeight * 0.9, 600);
      canvasWidth = canvasHeight * targetAspect;
    } else {
      canvasWidth = Math.min(containerWidth * 0.95, 1000);
      canvasHeight = canvasWidth / targetAspect;
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

    // Draw texture/color on wall area first
    ctx.save();
    
    // Fill wall area with base color or texture
    if (productType === "vicstrip" && selectedColor) {
      // VicStrip: Fill with color first
      ctx.fillStyle = selectedColor;
      ctx.fillRect(wallX, wallY, wallWidth, wallHeight);
      
      // Then overlay with slatted texture pattern
      if (textureImg) {
        ctx.globalCompositeOperation = "multiply";
        const tileDims = getTileDimensions();
        const patternCanvas = document.createElement("canvas");
        const patternCtx = patternCanvas.getContext("2d");
        patternCanvas.width = tileDims.width;
        patternCanvas.height = tileDims.height;
        patternCtx.drawImage(textureImg, 0, 0, tileDims.width, tileDims.height);
        const pattern = ctx.createPattern(patternCanvas, "repeat");
        ctx.fillStyle = pattern;
        ctx.fillRect(wallX, wallY, wallWidth, wallHeight);
      }
    } else if (textureImg) {
      // Other products: Just tile the texture
      const tileDims = getTileDimensions();
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
        ctx.globalCompositeOperation = "multiply";
        ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
        ctx.fillRect(wallX + 1, wallY + 1, wallWidth, wallHeight);
      }
    } else {
      // No texture - show placeholder wall color
      ctx.fillStyle = "#2d3748";
      ctx.fillRect(wallX, wallY, wallWidth, wallHeight);
    }
    
    ctx.restore();

    // Draw background image (furniture scene) on top
    if (bgImg) {
      ctx.save();
      
      // Draw only the furniture portion (bottom part of the image)
      const furnitureY = canvasHeight * WALL_MASK.height;
      const furnitureHeight = canvasHeight - furnitureY;
      
      // Source coordinates from background image
      const srcY = bgImg.height * WALL_MASK.height;
      const srcHeight = bgImg.height - srcY;
      
      ctx.drawImage(
        bgImg,
        0, srcY, bgImg.width, srcHeight,  // Source rect
        0, furnitureY, canvasWidth, furnitureHeight  // Dest rect
      );
      
      ctx.restore();
    }

    // Add subtle vignette effect
    const gradient = ctx.createRadialGradient(
      canvasWidth / 2, canvasHeight / 2, canvasHeight * 0.4,
      canvasWidth / 2, canvasHeight / 2, canvasHeight
    );
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, "rgba(0,0,0,0.15)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  }, [bgLoaded, selectedColor, size, isEmbossed, productType, getTileDimensions]);

  // Re-render when dependencies change
  useEffect(() => {
    if (bgLoaded) {
      renderCanvas();
    }
  }, [renderCanvas, bgLoaded, selectedColor, size, isEmbossed]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (bgLoaded) {
        renderCanvas();
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [renderCanvas, bgLoaded]);

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
        style={{ background: "#1a1a2e" }}
        data-testid="preview-canvas"
      />
    </div>
  );
});

CanvasPreview.displayName = "CanvasPreview";

export default CanvasPreview;
