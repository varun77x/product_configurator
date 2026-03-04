/**
 * FlatEmbossedPreview
 * ───────────────────
 * CSS-layer based room-scene preview for Flat / Embossed VMT Panels.
 *
 * Layer stack (bottom → top, z-index order):
 *   2  Pattern layer  — repeating panel columns (portrait mode)
 *   3  Tpatti layer   — optional decorative overlay PNG
 *   4  Furniture      — room photo with transparent wall cutout (DRIVES SIZING)
 *  10  Preloader      — spinner + blur during texture transitions
 *
 * Sizing principle:
 *   The <img> for the furniture is the ONLY element in normal flow
 *   (display: block, max-height: calc(100vh - 220px)).
 *   The wall-canvas wrapper is display: inline-block so it shrink-wraps
 *   to the furniture image. Every other layer is position: absolute and
 *   stretches to 100% of that bounding box.
 *
 * To add a new category:
 *   1. Add an entry to FLAT_EMBOSSED_VMT_CONFIG in src/data/skus.js
 *   2. Drop the furniture PNG, tpatti PNG, and panel textures in
 *      the corresponding /images/flat-embossed-vmt/… folders.
 */

import {
  useState,
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Loader2 } from "lucide-react";
import { useRenderLog } from "@/hooks/use-render-log";
import {
  FLAT_EMBOSSED_VMT_CONFIG,
  FLAT_EMBOSSED_VMT_DEFAULT_CONFIG,
} from "@/data/skus";

// ─── Transition timings ───────────────────────────────────────────────────────
/** Minimum ms the preloader is shown after a texture/category change */
const MIN_LOADING_MS = 400;
/** Extra ms the preloader holds after the image is ready (avoids hard cut) */
const POST_LOAD_HOLD_MS = 150;

// ─── Component ────────────────────────────────────────────────────────────────
const FlatEmbossedPreview = forwardRef(
  (
    {
      /** backend category id, e.g. "vmd-line-and-texture" */
      categoryId,
      /** resolved texture URL for the currently selected panel design */
      textureUrl,
      /** controlled from the sidebar Switch — mirrors the Embossed Finish toggle pattern */
      showTpatti = false,
    },
    ref
  ) => {
    const wallCanvasRef = useRef(null);

    // ── Double-buffer display state ────────────────────────────────────────
    // These are what the render actually uses. They stay FROZEN while the
    // preloader is on screen. New assets decode silently in the background;
    // everything is revealed atomically when the loader drops.
    const [displayedCategoryId, setDisplayedCategoryId] = useState(categoryId);
    const [displayedTextureUrl, setDisplayedTextureUrl] = useState(null);

    // Whether the preloader is visible
    const [isLoading, setIsLoading] = useState(false);

    const pendingTimerRef = useRef(null);

    // ── Render logging (remove when done profiling) ────────────────────────
    useRenderLog("FlatEmbossedPreview", { categoryId, textureUrl, showTpatti, displayedCategoryId, displayedTextureUrl, isLoading });

    // ── Config is derived from DISPLAYED (frozen) category, not the live prop
    const cfg =
      (displayedCategoryId && FLAT_EMBOSSED_VMT_CONFIG[displayedCategoryId]) ||
      FLAT_EMBOSSED_VMT_DEFAULT_CONFIG;

    // ── Double-buffer transition ───────────────────────────────────────────
    // Fires when either the category or the texture prop changes.
    // 1. Show loader immediately — displayed state stays frozen.
    // 2. Silently decode all incoming assets (furniture + panel texture).
    // 3. Wait for decoding + minimum hold time in parallel.
    // 4. After POST_LOAD_HOLD_MS extra hold, atomically:
    //      setDisplayedCategoryId + setDisplayedTextureUrl + setIsLoading(false)
    //    → one React render, old content → new content, loader gone, no blur leak.
    useEffect(() => {
      const targetCategoryId = categoryId;
      const targetTextureUrl = textureUrl;

      // Nothing changed from what is displayed — skip entirely
      if (
        targetCategoryId === displayedCategoryId &&
        targetTextureUrl === displayedTextureUrl
      ) return;

      // If there's genuinely nothing to show, clear immediately (no loader)
      if (!targetTextureUrl && !targetCategoryId) {
        if (pendingTimerRef.current) {
          clearTimeout(pendingTimerRef.current);
          pendingTimerRef.current = null;
        }
        setDisplayedCategoryId(null);
        setDisplayedTextureUrl(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      // Cancel any previously scheduled reveal
      if (pendingTimerRef.current) {
        clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }

      // Helper: decode an image URL silently (background prefetch)
      const decodeImage = (src) => {
        const img = new Image();
        img.src = src;
        return img.decode
          ? img.decode().catch(() => {})
          : new Promise((resolve) => {
              img.onload = resolve;
              img.onerror = resolve;
            });
      };

      const decodePromises = [];

      // Decode new furniture if category is changing
      const newCfg =
        (targetCategoryId && FLAT_EMBOSSED_VMT_CONFIG[targetCategoryId]) ||
        FLAT_EMBOSSED_VMT_DEFAULT_CONFIG;
      if (newCfg.furniture && targetCategoryId !== displayedCategoryId) {
        decodePromises.push(decodeImage(newCfg.furniture));
      }

      // Decode new panel texture if it's changing
      if (targetTextureUrl && targetTextureUrl !== displayedTextureUrl) {
        decodePromises.push(decodeImage(targetTextureUrl));
      }

      const _decodeStart = performance.now();
      const minTimePromise = new Promise((resolve) =>
        setTimeout(resolve, MIN_LOADING_MS)
      );

      Promise.all([...decodePromises, minTimePromise]).then(() => {
        const _decodeMs = (performance.now() - _decodeStart).toFixed(0);
        console.log(
          `%c🖼 [FEP] Assets decoded in ${_decodeMs}ms — holding ${POST_LOAD_HOLD_MS}ms more (POST_LOAD_HOLD_MS)`,
          "color:#80cbc4"
        );
        // All assets are decoded. Hold for one more beat, then reveal atomically.
        pendingTimerRef.current = setTimeout(() => {
          // Single React render: displayed state jumps from old → new
          // and the loader disappears — no intermediate state ever visible.
          setDisplayedCategoryId(targetCategoryId);
          setDisplayedTextureUrl(targetTextureUrl);
          setIsLoading(false);
          pendingTimerRef.current = null;
        }, POST_LOAD_HOLD_MS);
      });

      return () => {
        if (pendingTimerRef.current) {
          clearTimeout(pendingTimerRef.current);
          pendingTimerRef.current = null;
        }
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [categoryId, textureUrl]);

    // ── Download: capture the wall-canvas DOM node to a PNG ──────────────
    useImperativeHandle(ref, () => ({
      downloadImage: async () => {
        const node = wallCanvasRef.current;
        if (!node) return;
        try {
          const { toPng } = await import("html-to-image");
          const dataUrl = await toPng(node, { cacheBust: true, pixelRatio: 2 });
          const link = document.createElement("a");
          link.download = `univicoustic-design-${Date.now()}.png`;
          link.href = dataUrl;
          link.click();
        } catch (err) {
          console.error("[FlatEmbossedPreview] download failed:", err);
        }
      },
    }));

    // ── Computed style values ─────────────────────────────────────────────
    const hasTpatti = Boolean(cfg.tpatti);

    return (
      <div
        className="w-full h-full flex items-center justify-center"
        data-testid="flat-embossed-preview"
      >

        {/*
         * ── wall-canvas ──────────────────────────────────────────────────
         * display: inline-block  → shrink-wraps to the furniture image
         * position: relative     → absolute children anchor to this element
         * lineHeight: 0          → prevents gap below inline-block img
         */}
        <div
          ref={wallCanvasRef}
          style={{
            display: "inline-block",
            position: "relative",
            lineHeight: 0,
          }}
          data-testid="wall-canvas"
        >
          {/* ── Layer 1: Pattern (z-index 2) ── */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 2,
              overflow: "hidden",
            }}
            data-testid="pattern-layer"
          >
            {/*
             * Portrait-mode panel container:
             * Flex row → N equal-width columns that each fill the full height.
             * background-size: cover tiles the selected texture across each column.
             */}
            <div
              className="flat-embossed-panel-container"
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "stretch",
              }}
            >
              {Array.from({ length: cfg.repeat }).map((_, i) => (
                <div
                  key={i}
                  className="flat-embossed-panel"
                  style={{
                    width: `calc(100% / ${cfg.repeat})`,
                    height: "100%",
                    flexShrink: 0,
                    backgroundImage: displayedTextureUrl
                      ? `url(${displayedTextureUrl})`
                      : undefined,
                    backgroundColor: displayedTextureUrl
                      ? undefined
                      : "hsl(215 20% 88%)",
                    backgroundSize: "100% auto",
                    backgroundPosition: "top left",
                    backgroundRepeat: "no-repeat",
                  }}
                  data-testid={`panel-column-${i}`}
                />
              ))}
            </div>
          </div>

          {/* ── Layer 2: T-Patti overlay (z-index 3) ── */}
          {showTpatti && hasTpatti && (
            <img
              src={cfg.tpatti}
              alt="T-Patti decorative overlay"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                zIndex: 3,
                objectFit: "contain",
                background: "transparent",
                pointerEvents: "none",
                userSelect: "none",
              }}
              data-testid="tpatti-layer"
            />
          )}

          {/*
           * ── Layer 3: Furniture image (z-index 4) ────────────────────────
           * THE SIZE-DEFINING ELEMENT.
           * position: relative keeps it in normal document flow so the
           * inline-block wall-canvas shrink-wraps to its dimensions.
           * max-height: calc(100vh - 220px) prevents viewport overflow.
           * The PNG must have a transparent cut-out where the wall panels
           * are visible so the layers beneath show through.
           */}
          <img
            src={cfg.furniture}
            alt="Room interior with furniture"
            style={{
              position: "relative",
              display: "block",
              maxWidth: "calc(100vw - 420px)",
              maxHeight: "calc(100vh - 80px)",
              zIndex: 4,
              userSelect: "none",
              pointerEvents: "none",
            }}
            data-testid="furniture-layer"
          />

          {/* ── Layer 4: Preloader (z-index 10) ── */}
          {isLoading && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backdropFilter: "blur(2px)",
                WebkitBackdropFilter: "blur(2px)",
                background: "transparent",
              }}
              data-testid="flat-embossed-preloader"
            >
              <Loader2 className="h-8 w-8 animate-spin text-[hsl(24,95%,53%)]" />
            </div>
          )}
        </div>
      </div>
    );
  }
);

FlatEmbossedPreview.displayName = "FlatEmbossedPreview";

export default FlatEmbossedPreview;
