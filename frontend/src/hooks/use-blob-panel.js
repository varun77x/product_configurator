import { useState, useEffect, useRef } from "react";

/**
 * Fetches any panel image as a Blob URL so that exactly one full-resolution
 * decoded image is held in memory at a time.
 *
 * Pass a fully-qualified URL (or null to deactivate).
 * When url changes:
 *   - The in-flight fetch for the previous url is aborted.
 *   - The old Blob URL stays alive (keeping the preview visible) until the
 *     new image is ready, then an atomic swap occurs — no blank flash.
 *   - cache: 'no-store' prevents 304 responses whose empty body would create
 *     a 0-byte blob that renders nothing.
 *
 * On unmount: the active fetch is aborted and the final Blob URL is revoked.
 *
 * @param {string|null} url  - fully-qualified image URL, or null to deactivate
 * @returns {{ blobUrl: string|null, isLoading: boolean }}
 */
export function useBlobPanel(url) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const currentBlobRef = useRef(null);
  const abortRef = useRef(null);

  // ── Effect 1: fetch whenever url changes ───────────────────────────────
  useEffect(() => {
    if (!url) {
      // Deactivated — immediately clear the displayed blob so a stale image
      // from the previous url doesn't bleed through when the hook is reused
      // for a different product/category.
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      if (currentBlobRef.current) {
        URL.revokeObjectURL(currentBlobRef.current);
        currentBlobRef.current = null;
      }
      setBlobUrl(null);
      setIsLoading(false);
      return;
    }

    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);

    fetch(url, { signal: controller.signal, cache: "no-store" })
      .then((res) => {
        if (controller.signal.aborted) return null;
        if (!res.ok) throw new Error(`Panel fetch failed: ${res.status} ${url}`);
        return res.blob();
      })
      .then((blob) => {
        if (!blob || controller.signal.aborted) return;
        if (blob.size === 0) {
          console.warn("[useBlobPanel] Empty blob received for", url);
          setIsLoading(false);
          return;
        }
        // Atomic swap: revoke old only when new is ready — no blank flash
        if (currentBlobRef.current) {
          URL.revokeObjectURL(currentBlobRef.current);
        }
        const newUrl = URL.createObjectURL(blob);
        currentBlobRef.current = newUrl;
        setBlobUrl(newUrl);
        setIsLoading(false);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          console.error("[useBlobPanel] Failed to load panel:", err);
          setIsLoading(false);
        }
      });

    // Only abort in-flight fetch on url change — keep old blob visible
    return () => {
      controller.abort();
    };
  }, [url]);

  // ── Effect 2: unmount-only cleanup ────────────────────────────────────
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (currentBlobRef.current) {
        URL.revokeObjectURL(currentBlobRef.current);
        currentBlobRef.current = null;
      }
    };
  }, []);

  return { blobUrl, isLoading };
}

/**
 * Parallel version of useBlobPanel for an array of URLs (e.g. the 3 slices of
 * a continuous-pattern design).  Each URL is managed independently with its
 * own AbortController and blob lifecycle.  The returned `blobUrls` array has
 * the same length and order as the input; entries are null until the image is
 * ready.  `isLoading` is true while ANY fetch is in progress.
 *
 * @param {string[]|null} urls
 * @returns {{ blobUrls: (string|null)[], isLoading: boolean }}
 */
export function useMultiBlobPanels(urls) {
  const urlsJson = JSON.stringify(urls);
  const [blobUrls, setBlobUrls] = useState([]);
  const [loadingCount, setLoadingCount] = useState(0);

  const blobRefs = useRef([]);
  const abortRefs = useRef([]);

  useEffect(() => {
    if (!urls?.length) {
      // Deactivated — revoke any live blobs so they don't bleed through
      abortRefs.current.forEach((c) => c?.abort());
      blobRefs.current.forEach((u) => u && URL.revokeObjectURL(u));
      blobRefs.current = [];
      abortRefs.current = [];
      setBlobUrls([]);
      setLoadingCount(0);
      return;
    }

    // Abort any previous fetches and revoke their blob URLs
    abortRefs.current.forEach((c) => c?.abort());
    blobRefs.current.forEach((u) => u && URL.revokeObjectURL(u));
    blobRefs.current = Array(urls.length).fill(null);
    abortRefs.current = [];

    setBlobUrls(Array(urls.length).fill(null));
    setLoadingCount(urls.length);

    urls.forEach((url, i) => {
      const controller = new AbortController();
      abortRefs.current[i] = controller;

      fetch(url, { signal: controller.signal, cache: "no-store" })
        .then((res) => {
          if (controller.signal.aborted) return null;
          if (!res.ok) throw new Error(`Multi-blob fetch failed: ${res.status} ${url}`);
          return res.blob();
        })
        .then((blob) => {
          if (!blob || blob.size === 0 || controller.signal.aborted) return;
          if (blobRefs.current[i]) URL.revokeObjectURL(blobRefs.current[i]);
          const newUrl = URL.createObjectURL(blob);
          blobRefs.current[i] = newUrl;
          setBlobUrls((prev) => {
            const next = [...prev];
            next[i] = newUrl;
            return next;
          });
          setLoadingCount((n) => Math.max(0, n - 1));
        })
        .catch((err) => {
          if (err.name !== "AbortError") {
            console.error("[useMultiBlobPanels] Failed to load:", url, err);
            setLoadingCount((n) => Math.max(0, n - 1));
          }
        });
    });

    return () => {
      abortRefs.current.forEach((c) => c?.abort());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlsJson]);

  // Unmount cleanup
  useEffect(() => {
    return () => {
      abortRefs.current.forEach((c) => c?.abort());
      blobRefs.current.forEach((u) => u && URL.revokeObjectURL(u));
    };
  }, []);

  return { blobUrls, isLoading: loadingCount > 0 };
}
