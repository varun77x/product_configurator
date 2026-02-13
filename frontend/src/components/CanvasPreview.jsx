import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle, useState } from "react";
import { Loader2 } from "lucide-react";

const CanvasPreview = forwardRef(({ 
  backgroundImage, 
  textureColor,
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

  // Wall mask area - adjusted for the provided interior image
  // The wall is the dark area at the top of the image
  const WALL_MASK = {
    x: 0.0,
    y: 0.0,
    width: 1.0,
    height: 0.56
  };

  // Parse size to get tile dimensions for grid effect
  const getTileDimensions = useCallback(() => {
    if (!size) return { width: 80, height: 80 };
    const [w, h] = size.split('x').map(Number);
    const scale = 0.12;
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
      setBgLoaded(true);
    };
    img.src = backgroundImage;
  }, [backgroundImage]);

  // Render canvas
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const bgImg = bgImageRef.current;

    // Set canvas size
    const containerWidth = canvas.parentElement?.clientWidth || 900;
    const containerHeight = canvas.parentElement?.clientHeight || 600;
    
    const targetAspect = 16 / 9;
    let canvasWidth, canvasHeight;
    
    if (containerWidth / containerHeight > targetAspect) {
      canvasHeight = Math.min(containerHeight * 0.9, 650);
      canvasWidth = canvasHeight * targetAspect;
    } else {
      canvasWidth = Math.min(containerWidth * 0.95, 1100);
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

    // Determine the color to use
    let wallColor = textureColor || "#2d3748";
    if (productType === "vicstrip" && selectedColor) {
      wallColor = selectedColor;
    }

    // Draw wall texture/color
    ctx.save();
    
    // Fill with solid color
    ctx.fillStyle = wallColor;
    ctx.fillRect(wallX, wallY, wallWidth, wallHeight);

    // Add tile grid lines for panel effect
    const tileDims = getTileDimensions();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.1)";
    ctx.lineWidth = 1;

    // Vertical lines
    for (let x = wallX; x <= wallX + wallWidth; x += tileDims.width) {
      ctx.beginPath();
      ctx.moveTo(x, wallY);
      ctx.lineTo(x, wallY + wallHeight);
      ctx.stroke();
    }

    // Horizontal lines
    for (let y = wallY; y <= wallY + wallHeight; y += tileDims.height) {
      ctx.beginPath();
      ctx.moveTo(wallX, y);
      ctx.lineTo(wallX + wallWidth, y);
      ctx.stroke();
    }

    // Add emboss effect if enabled
    if (isEmbossed) {
      // Highlight effect
      ctx.globalCompositeOperation = "overlay";
      ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
      ctx.fillRect(wallX, wallY, wallWidth, wallHeight);
      
      // Shadow for depth
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
      for (let x = wallX; x < wallX + wallWidth; x += tileDims.width) {
        for (let y = wallY; y < wallY + wallHeight; y += tileDims.height) {
          ctx.fillRect(x + 2, y + 2, tileDims.width - 4, tileDims.height - 4);
        }
      }
    }

    // Add VicStrip groove pattern
    if (productType === "vicstrip") {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = "rgba(0, 0, 0, 0.15)";
      ctx.lineWidth = 2;
      
      // Vertical slat lines
      const slatWidth = 20;
      for (let x = wallX + slatWidth; x < wallX + wallWidth; x += slatWidth) {
        ctx.beginPath();
        ctx.moveTo(x, wallY);
        ctx.lineTo(x, wallY + wallHeight);
        ctx.stroke();
      }
    }

    ctx.restore();

    // Draw background image (furniture) on top
    if (bgImg) {
      ctx.save();
      
      const furnitureY = canvasHeight * WALL_MASK.height;
      const furnitureHeight = canvasHeight - furnitureY;
      
      const srcY = bgImg.height * WALL_MASK.height;
      const srcHeight = bgImg.height - srcY;
      
      ctx.drawImage(
        bgImg,
        0, srcY, bgImg.width, srcHeight,
        0, furnitureY, canvasWidth, furnitureHeight
      );
      
      ctx.restore();
    }

    // Add subtle vignette
    const gradient = ctx.createRadialGradient(
      canvasWidth / 2, canvasHeight / 2, canvasHeight * 0.5,
      canvasWidth / 2, canvasHeight / 2, canvasHeight
    );
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, "rgba(0,0,0,0.1)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  }, [bgLoaded, textureColor, selectedColor, size, isEmbossed, productType, getTileDimensions]);

  // Re-render when dependencies change
  useEffect(() => {
    if (bgLoaded) {
      renderCanvas();
    }
  }, [renderCanvas, bgLoaded, textureColor, selectedColor, size, isEmbossed]);

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

  // Expose download function
  useImperativeHandle(ref, () => ({
    downloadImage: () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

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
