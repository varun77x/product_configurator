/**
 * FlatEmbossedPreview
 * ───────────────────
 * CSS-layer based room-scene preview for Flat / Embossed VMT Panels.
 *
 * Layer stack (bottom → top, z-index order):
 *   2  Pattern layer  — repeating panel columns (portrait mode)
 *   3  Tpatti layer   — optional decorative overlay PNG (below emboss)
 *   4  Emboss layer   — optional emboss/groove overlay PNG (above T-Patti)
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
import { toPng } from "html-to-image";
import { useRenderLog } from "@/hooks/use-render-log";
import { useBlobPanel } from "@/hooks/use-blob-panel";
import {
  FLAT_EMBOSSED_VMT_CONFIG,
  FLAT_EMBOSSED_VMT_DEFAULT_CONFIG,
} from "@/data/skus";

// ─── Transition timings ───────────────────────────────────────────────────────
/** Minimum ms the preloader is shown after a texture/category change */
const MIN_LOADING_MS = 400;
/** Solid color shown over the preview while a transition is loading.
 *  Swap to any CSS color value — e.g. "#f5f5f5", "rgba(255,255,255,0.9)", etc. */
const TRANSITION_OVERLAY_COLOR = "#ffffff";
/** Extra ms the loader holds AFTER ghost drops + new image is visible beneath.
 *  Gives the browser time to fully composite all layers before revealing. */
const POST_REVEAL_HOLD_MS = 1000;

/**
 * Kicks off background loading for an array of image URLs so they are
 * browser-cached before the user explicitly needs them.
 * Safe to call at any time — duplicates are silently ignored by the browser.
 *
 * @param {string[]} urls
 */
export function preloadImages(urls) {
  urls.forEach((url) => {
    if (!url) return;
    const img = new Image();
    img.src = url;
  });
}

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
      /** whether to flip the center column image horizontally */
      flipCenter = false,
      /** called with (isLoading: boolean) whenever the loading state changes */
      onLoadingChange = null,
      /** override the number of vertical panel rows (default: 2 when emboss active, else 1) */
      panelRows = null,
      /** solid CSS color to fill panel columns when no texture is loaded (e.g. ombre base color) */
      panelFallbackColor = null,
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
    // True when the category (furniture) is also changing — overlay covers everything.
    // False for same-category swaps — overlay sits below the furniture so only the wall area
    // appears to be loading while the furniture remains fully visible.
    const [loadingCoversAll, setLoadingCoversAll] = useState(false);

    // Notify parent when loading state changes
    useEffect(() => {
      onLoadingChange?.(isLoading);
    }, [isLoading, onLoadingChange]);

    // ── Render logging (remove when done profiling) ────────────────────────
    useRenderLog("FlatEmbossedPreview", { categoryId, textureUrl, textureUrls, showTpatti, embossUrl, displayedCategoryId, displayedTextureUrls, displayedEmbossUrl, isLoading });

    // ── Config is derived from DISPLAYED (frozen) category, not the live prop
    const cfg =
      (displayedCategoryId && FLAT_EMBOSSED_VMT_CONFIG[displayedCategoryId]) ||
      FLAT_EMBOSSED_VMT_DEFAULT_CONFIG;

    // ── Fetch furniture + tpatti as blob URLs so html-to-image can inline them ──
    // Without this, toPng's internal fetch() hits CORS when the backend is on a
    // different host/IP than the frontend (e.g. LAN IP vs localhost).
    const { blobUrl: furnitureBlobUrl } = useBlobPanel(cfg.furniture ?? null);
    const { blobUrl: tpattiBlobUrl } = useBlobPanel(cfg.tpatti ?? null);

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
        setDisplayedCategoryId(null);
        setDisplayedTextureUrls(null);
        setDisplayedShowTpatti(targetShowTpatti);
        setDisplayedEmbossUrl(targetEmbossUrl);
        setIsLoading(false);
        return;
      }

      const categoryChanging = targetCategoryId !== displayedCategoryId;

      // Freeze the display completely — nothing is committed until all assets
      // are decoded (see Promise.all below).  The old panels, furniture and
      // tpatti remain painted in the DOM and stay visible under the blur
      // overlay.  Previously an early setDisplayedTextureUrls() was done for
      // same-category switches which caused new (not-yet-decoded) <img>
      // elements to mount immediately, making panels go blank under the blur.
      setLoadingCoversAll(categoryChanging);
      setIsLoading(true);

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
        // Wait POST_REVEAL_HOLD_MS, then drop snapshot and loader together.
        revealTimer = setTimeout(() => {
          if (!cancelled) {
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
      downloadImage: async (overrideFilename, addHeader) => {
        const node = wallCanvasRef.current;
        if (!node) return;
        try {
          // cacheBust: true appends query params to every url() value, which
          // corrupts blob: URLs (they don't support query strings) and causes
          // ERR_FILE_NOT_FOUND. skipFonts silences the cross-origin
          // Google Fonts SecurityError from html-to-image's CSS rule walk.
          let dataUrl = await toPng(node, { pixelRatio: 2, skipFonts: true });
          if (addHeader) {
            try { dataUrl = await addHeader(dataUrl); }
            catch (err) { console.error("[FlatEmbossedPreview] header failed:", err); }
          }
          const link = document.createElement("a");
          link.download = overrideFilename || `univicoustic-design-${Date.now()}.png`;
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
    // Always render 2 rows so the pattern (and emboss/groove) fills the full wall height
    // regardless of panel aspect ratio. Each row repeats the same column layout:
    //   AAA → AAA / ABA → ABA / ABC → ABC
    // panelRows prop allows callers to override (e.g. small 600x600 tiles need more rows).
    const panelRowCount = panelRows ?? 2;

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
                // Sub-pixel gap filler: paint the same texture on the container so
                // any hairline gap between flex columns at non-100% zoom exposes the
                // same image (not the white page background), making the seam invisible.
                // Only applies when all columns share one texture (single-url designs).
                ...(displayedTextureUrls?.length === 1 && !panelFallbackColor
                  ? {
                      backgroundImage: `url(${displayedTextureUrls[0]})`,
                      backgroundSize: `calc(100% / ${displayedTextureUrls.length > 1 ? displayedTextureUrls.length : cfg.repeat}) auto`,
                      backgroundRepeat: "repeat",
                      backgroundPosition: "top left",
                    }
                  : {}),
              }}
            >
{(() => {
                  // Continuous designs (>1 slice): column count = number of slices (3, 4, …)
                  // Single designs (1 url):         column count = cfg.repeat so they tile correctly
                  const columnCount =
                    displayedTextureUrls?.length > 1
                      ? displayedTextureUrls.length
                      : cfg.repeat;
                  const centerIndex = Math.floor(columnCount / 2);
                  return Array.from({ length: columnCount }).map((_, i) => {
                    const colUrl = displayedTextureUrls
                      ? displayedTextureUrls[i % displayedTextureUrls.length]
                      : null;
                    const isCenter = i === centerIndex;
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
                          backgroundColor: panelFallbackColor || (colUrl ? undefined : "hsl(215 20% 88%)"),
                        }}
                        data-testid={`panel-column-${i}`}
                      >
                        {colUrl && (
                          <div
                            style={{
                              position: "absolute",
                              inset: 0,
                              display: "flex",
                              flexDirection: "column",
                            }}
                          >
                            {Array.from({ length: panelRowCount }).map((__, rowIndex) => (
                              <img
                                key={`${colUrl}-${rowIndex}-${isCenter && flipCenter ? "flipped" : "normal"}`}
                                src={colUrl}
                                alt=""
                                draggable={false}
                                style={{
                                  width: "100%",
                                  height: "auto",
                                  display: "block",
                                  flexShrink: 0,
                                  pointerEvents: "none",
                                  userSelect: "none",
                                  transform: isCenter && flipCenter ? "scaleX(-1)" : undefined,
                                  transformOrigin: "center",
                                }}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
            </div>
          </div>

          {/* ── Layer 2: T-Patti overlay (z-index 3) — hidden when emboss is active ── */}
          {hasTpatti && !hasEmboss && (
            <img
              src={tpattiBlobUrl ?? cfg.tpatti}
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

          {/* ── Layer 3: Emboss overlay (z-index 4) — above T-Patti ── */}
          {hasEmboss && (() => {
            const columnCount =
              displayedTextureUrls?.length > 1
                ? displayedTextureUrls.length
                : cfg.repeat;
            return (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 4,
                  display: "flex",
                  alignItems: "stretch",
                  pointerEvents: "none",
                  userSelect: "none",
                }}
                data-testid="emboss-layer"
              >
                {Array.from({ length: columnCount }).map((_, i) => {
                  const centerIndex = Math.floor(columnCount / 2);
                  const isCenter = i === centerIndex;
                  return (
                    <div
                      key={i}
                      style={{
                        position: "relative",
                        flex: 1,
                        height: "100%",
                        overflow: "hidden",
                      }}
                    >
                      <img
                        src={displayedEmbossUrl}
                        alt=""
                        draggable={false}
                        style={{
                          width: "100%",
                          height: "auto",
                          display: "block",
                          pointerEvents: "none",
                          userSelect: "none",
                          transform: isCenter && flipCenter ? "scaleX(-1)" : undefined,
                          transformOrigin: "center",
                        }}
                      />
                      {Array.from({ length: panelRowCount - 1 }).map((_, rowIndex) => (
                        <img
                          key={`emboss-${i}-${rowIndex}`}
                          src={displayedEmbossUrl}
                          alt=""
                          draggable={false}
                          style={{
                            width: "100%",
                            height: "auto",
                            display: "block",
                            pointerEvents: "none",
                            userSelect: "none",
                            transform: isCenter && flipCenter ? "scaleX(-1)" : undefined,
                            transformOrigin: "center",
                          }}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/*
           * ── Layer 4: Furniture image (z-index 5) ────────────────────────
           * THE SIZE-DEFINING ELEMENT.
           * position: relative keeps it in normal document flow so the
           * inline-block wall-canvas shrink-wraps to its dimensions.
           * max-height: calc(100vh - 220px) prevents viewport overflow.
           * The PNG must have a transparent cut-out where the wall panels
           * are visible so the layers beneath show through.
           */}
          <img
            key={cfg.furniture}
            src={furnitureBlobUrl ?? cfg.furniture}
            alt="Room interior with furniture"
            style={{
              position: "relative",
              display: "block",
              maxWidth: "calc(100vw - 360px)",
              maxHeight: "calc(100vh - 64px)",
              zIndex: 6,
              userSelect: "none",
              pointerEvents: "none",
            }}
            data-testid="furniture-layer"
          />

          {/* ── Layer 5: Preloader ──
               Category changing  → z=10 (above furniture): full white overlay.
               Same-category swap → z=5 (below furniture z=6): only the wall area
               appears to load; furniture stays visible above. */}
          {isLoading && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: loadingCoversAll ? 10 : 5,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: TRANSITION_OVERLAY_COLOR,
              }}
              data-testid="flat-embossed-preloader"
            >
              <img src="/UV-loader.png" alt="Loading..." className="uv-loader" />
            </div>
          )}


        </div>
      </div>
    );
  }
);

FlatEmbossedPreview.displayName = "FlatEmbossedPreview";

export default FlatEmbossedPreview;
