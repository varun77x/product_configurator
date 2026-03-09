/**
 * FlatEmbossedPreview
 * ───────────────────
 * CSS-layer based room-scene preview for Flat / Embossed VMT Panels.
 *
 * Layer stack (bottom → top, z-index order):
 *   2  Pattern layer  — repeating panel columns (portrait mode)
 *   3  Emboss layer   — optional emboss pattern overlay PNG (behind T-Patti)
 *   4  Tpatti layer   — optional decorative overlay PNG
 *   5  Furniture      — room photo with transparent wall cutout (DRIVES SIZING)
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
/** Extra ms the loader holds AFTER ghost drops + new image is visible beneath.
 *  Gives the browser time to fully composite all layers before revealing. */
const POST_REVEAL_HOLD_MS = 1000;

// ─── Component ────────────────────────────────────────────────────────────────
const FlatEmbossedPreview = forwardRef(
  (
    {
      /** backend category id, e.g. "vmd-line-and-texture" */
      categoryId,
      /**
       * Single-texture designs: pass a string URL — it is repeated across every column.
       * Continuous-pattern designs: pass textureUrls (array) instead and leave this null.
       */
      textureUrl = null,
      /**
       * Continuous-pattern designs: array of per-column URLs.
       * Length must equal cfg.repeat (typically 3).
       * e.g. ["…VMD-LT-009-1.jpg", "…VMD-LT-009-2.jpg", "…VMD-LT-009-3.jpg"]
       */
      textureUrls = null,
      /** controlled from the sidebar Switch — mirrors the Embossed Finish toggle pattern */
      showTpatti = false,
      /** URL for the emboss pattern overlay PNG; null = no emboss */
      embossUrl = null,
    },
    ref
  ) => {
    const wallCanvasRef = useRef(null);

    // ── Stable key for the incoming textureUrls array (avoids array-as-dep issues) ──
    // textureUrls can be null (single designs) or string[] (continuous designs).
    // textureUrl (legacy string prop) is normalised into a single-element array.
    const textureUrlsJson = JSON.stringify(
      textureUrls?.length ? textureUrls : textureUrl ? [textureUrl] : null
    );

    // ── Double-buffer display state ────────────────────────────────────────
    // These are what the render actually uses. They stay FROZEN while the
    // preloader is on screen. New assets decode silently in the background;
    // everything is revealed atomically when the loader drops.
    const [displayedCategoryId, setDisplayedCategoryId] = useState(categoryId);
    // string[] | null — each element is the URL for one column, or null for placeholder
    const [displayedTextureUrls, setDisplayedTextureUrls] = useState(null);
    const [displayedShowTpatti, setDisplayedShowTpatti] = useState(showTpatti);
    const [displayedEmbossUrl, setDisplayedEmbossUrl] = useState(embossUrl);

    // Whether the preloader is visible
    const [isLoading, setIsLoading] = useState(false);

    // ── Ghost layer state ──────────────────────────────────────────────────
    // When a transition starts we immediately snapshot the currently-displayed
    // state here.  The ghost layer re-renders those old images (already in the
    // browser's memory cache, so zero-latency) at z-index 9, sitting above all
    // live content layers but below the preloader at z-index 10.  The loader's
    // blur covers the ghost, hiding it from the user.  When the new content is
    // fully decoded the ghost + loader drop together → clean atomic reveal.
    const [ghostCategoryId, setGhostCategoryId] = useState(null);
    const [ghostTextureUrls, setGhostTextureUrls] = useState(null);
    const [ghostShowTpatti, setGhostShowTpatti] = useState(false);
    const [ghostVisible, setGhostVisible] = useState(false);

    // ── Render logging (remove when done profiling) ────────────────────────
    useRenderLog("FlatEmbossedPreview", { categoryId, textureUrl, textureUrls, showTpatti, embossUrl, displayedCategoryId, displayedTextureUrls, displayedEmbossUrl, isLoading });

    // ── Config is derived from DISPLAYED (frozen) category, not the live prop
    const cfg =
      (displayedCategoryId && FLAT_EMBOSSED_VMT_CONFIG[displayedCategoryId]) ||
      FLAT_EMBOSSED_VMT_DEFAULT_CONFIG;

    // ── Double-buffer transition ───────────────────────────────────────────
    // Fires when category, texture, or showTpatti changes.
    // 1. Freeze current display into ghost layer (instant cache re-render).
    // 2. Commit new display state immediately — new <img> elements mount
    //    and start painting *behind* the ghost (invisible to user).
    // 3. img.decode() the new assets + MIN_LOADING_MS in parallel.
    // 4. When both done → drop ghost + loader in one React batch → no white flash.
    useEffect(() => {
      // Cancellation flag — set to true in cleanup so stale async callbacks
      // from a previous effect run cannot modify state after the effect is gone.
      let cancelled = false;

      const targetCategoryId = categoryId;
      const targetShowTpatti = showTpatti;
      const targetEmbossUrl = embossUrl;

      // Normalise incoming URLs to string[] | null (works for both single and continuous)
      const targetTextureUrls = textureUrls?.length
        ? textureUrls
        : textureUrl
        ? [textureUrl]
        : null;
      const targetTextureUrlsJson = JSON.stringify(targetTextureUrls);
      const displayedTextureUrlsJson = JSON.stringify(displayedTextureUrls);

      // Nothing changed from what is displayed — skip entirely
      if (
        targetCategoryId === displayedCategoryId &&
        targetTextureUrlsJson === displayedTextureUrlsJson &&
        targetShowTpatti === displayedShowTpatti &&
        targetEmbossUrl === displayedEmbossUrl
      ) return;

      // If there's genuinely nothing to show, clear immediately (no loader)
      if (!targetTextureUrls?.length && !targetCategoryId) {
        setGhostVisible(false);
        setDisplayedCategoryId(null);
        setDisplayedTextureUrls(null);
        setDisplayedShowTpatti(targetShowTpatti);
        setDisplayedEmbossUrl(targetEmbossUrl);
        setIsLoading(false);
        return;
      }

      const categoryChanging = targetCategoryId !== displayedCategoryId;

      // Step 1: Freeze current view into ghost layer + show loader immediately.
      setGhostCategoryId(displayedCategoryId);
      setGhostTextureUrls(displayedTextureUrls);
      setGhostShowTpatti(displayedShowTpatti);
      setGhostVisible(true);
      setIsLoading(true);

      // Step 2: For same-category switches only, commit the new panel URLs immediately.
      // The furniture img stays the same → no size-collapse → ghost covers the flash.
      // For category switches we MUST NOT commit displayedCategoryId yet — the new
      // furniture <img> is the size-defining element; committing it before it has
      // loaded collapses the wall-canvas to zero height, taking the ghost with it.
      if (!categoryChanging) {
        setDisplayedTextureUrls(targetTextureUrls);
        setDisplayedShowTpatti(targetShowTpatti);
        setDisplayedEmbossUrl(targetEmbossUrl);
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

      // Decode new panel textures if they're changing (deduplicate URLs to avoid redundant fetches)
      if (targetTextureUrls?.length && targetTextureUrlsJson !== displayedTextureUrlsJson) {
        const uniqueUrls = [...new Set(targetTextureUrls)];
        uniqueUrls.forEach((url) => decodePromises.push(decodeImage(url)));
      }

      // Decode tpatti if it's being turned on (and hasn't been shown yet)
      if (targetShowTpatti && !displayedShowTpatti && newCfg.tpatti) {
        decodePromises.push(decodeImage(newCfg.tpatti));
      }

      // Decode emboss if it's being introduced or changed
      if (targetEmbossUrl && targetEmbossUrl !== displayedEmbossUrl) {
        decodePromises.push(decodeImage(targetEmbossUrl));
      }

      const _decodeStart = performance.now();
      const minTimePromise = new Promise((resolve) =>
        setTimeout(resolve, MIN_LOADING_MS)
      );

      let revealTimer = null;

      Promise.all([...decodePromises, minTimePromise]).then(() => {
        if (cancelled) return;
        // All assets decoded. Commit display state and drop the ghost so the
        // new image renders beneath the loader blur.
        setDisplayedCategoryId(targetCategoryId);
        setDisplayedTextureUrls(targetTextureUrls);
        setDisplayedShowTpatti(targetShowTpatti);
        setDisplayedEmbossUrl(targetEmbossUrl);
        // Wait POST_REVEAL_HOLD_MS, then drop ghost and loader together.
        revealTimer = setTimeout(() => {
          if (!cancelled) {
            setGhostVisible(false);
            setIsLoading(false);
          }
        }, POST_REVEAL_HOLD_MS);
      });

      return () => {
        cancelled = true;
        if (revealTimer) clearTimeout(revealTimer);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [categoryId, textureUrlsJson, showTpatti, embossUrl]);

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
    const hasTpatti = Boolean(cfg.tpatti) && displayedShowTpatti;
    const hasEmboss = Boolean(displayedEmbossUrl);

    // Ghost layer config (derived from frozen ghost category)
    const ghostCfg =
      (ghostCategoryId && FLAT_EMBOSSED_VMT_CONFIG[ghostCategoryId]) ||
      FLAT_EMBOSSED_VMT_DEFAULT_CONFIG;
    const ghostColumnCount =
      ghostTextureUrls?.length > 1 ? ghostTextureUrls.length : ghostCfg.repeat;

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
{(() => {
                  // Continuous designs (>1 slice): column count = number of slices (3, 4, …)
                  // Single designs (1 url):         column count = cfg.repeat so they tile correctly
                  const columnCount =
                    displayedTextureUrls?.length > 1
                      ? displayedTextureUrls.length
                      : cfg.repeat;
                  return Array.from({ length: columnCount }).map((_, i) => {
                    const colUrl = displayedTextureUrls
                      ? displayedTextureUrls[i % displayedTextureUrls.length]
                      : null;
                    return (
                      <div
                        key={i}
                        className="flat-embossed-panel"
                        style={{
                          position: "relative",
                          width: `calc(100% / ${columnCount})`,
                          height: "100%",
                          flexShrink: 0,
                          overflow: "hidden",
                          backgroundColor: colUrl ? undefined : "hsl(215 20% 88%)",
                        }}
                        data-testid={`panel-column-${i}`}
                      >
                        {colUrl && (
                          <img
                            key={colUrl}
                            src={colUrl}
                            alt=""
                            draggable={false}
                            style={{
                              width: "100%",
                              height: "auto",
                              display: "block",
                              position: "absolute",
                              top: 0,
                              left: 0,
                              pointerEvents: "none",
                              userSelect: "none",
                            }}
                          />
                        )}
                      </div>
                    );
                  });
                })()}
            </div>
          </div>

          {/* ── Layer 2: Emboss overlay (z-index 3) ── */}
          {hasEmboss && (
            <img
              src={displayedEmbossUrl}
              alt="Emboss pattern overlay"
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
              data-testid="emboss-layer"
            />
          )}

          {/* ── Layer 3: T-Patti overlay (z-index 4) ── */}
          {hasTpatti && (
            <img
              src={cfg.tpatti}
              alt="T-Patti decorative overlay"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                zIndex: 4,
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
            key={cfg.furniture}
            src={cfg.furniture}
            alt="Room interior with furniture"
            style={{
              position: "relative",
              display: "block",
              maxWidth: "calc(100vw - 420px)",
              maxHeight: "calc(100vh - 80px)",
              zIndex: 5,
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

          {/*
           * ── Ghost layer (z-index 9) ──────────────────────────────────────
           * Re-renders the previously-displayed images (already in browser
           * memory cache → instant, zero-latency) directly above all live
           * content layers.  The preloader blur at z-index 10 covers it so
           * the user just sees a blurred image while new content loads below.
           * Dropped together with the loader once img.decode() resolves.
           */}
          {ghostVisible && (() => {
            return (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 9,
                  overflow: "hidden",
                  pointerEvents: "none",
                  // Fallback background — if ghost images miss cache and take time
                  // to reload, this neutral tone fills the space instead of white.
                  background: "hsl(215 20% 88%)",
                }}
                data-testid="ghost-layer"
              >
                {/* Ghost panels */}
                {ghostTextureUrls?.length > 0 && (
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "stretch" }}>
                    {Array.from({ length: ghostColumnCount }).map((_, i) => {
                      const url = ghostTextureUrls[i % ghostTextureUrls.length];
                      return (
                        <div
                          key={i}
                          style={{
                            position: "relative",
                            width: `calc(100% / ${ghostColumnCount})`,
                            height: "100%",
                            overflow: "hidden",
                            flexShrink: 0,
                          }}
                        >
                          <img
                            src={url}
                            alt=""
                            style={{
                              width: "100%",
                              height: "auto",
                              position: "absolute",
                              top: 0,
                              left: 0,
                              display: "block",
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
                {/* Ghost tpatti */}
                {ghostShowTpatti && ghostCfg.tpatti && (
                  <img
                    src={ghostCfg.tpatti}
                    alt=""
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                      zIndex: 1,
                    }}
                  />
                )}
                {/* Ghost furniture — sits on top to perfectly replicate the scene.
                    onError: if furniture fails to load from cache, hide the ghost
                    entirely so the loader blur covers live content cleanly. */}
                <img
                  src={ghostCfg.furniture}
                  alt=""
                  onError={() => setGhostVisible(false)}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    objectPosition: "center top",
                    zIndex: 2,
                  }}
                />
              </div>
            );
          })()}
        </div>
      </div>
    );
  }
);

FlatEmbossedPreview.displayName = "FlatEmbossedPreview";

export default FlatEmbossedPreview;
