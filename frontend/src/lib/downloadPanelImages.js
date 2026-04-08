import JSZip from "jszip";
import { saveAs } from "file-saver";

async function fetchBlob(url) {
  console.debug('[download] fetch start', url);
  const res = await fetch(url, { credentials: 'omit', mode: 'cors', cache: 'no-store' });
  console.debug('[download] fetch response', url, res.status, res.type);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.blob();
}

export async function downloadPanelImages({ design, categoryId }) {
  try {
    // const BACKEND = process.env.REACT_APP_BACKEND_URL || window.location.origin;
    const BACKEND = process.env.REACT_APP_ASSETS_URL || window.location.origin;

    // Normalize helper to absolute URL
    const toAbsolute = (u) => (u && u.startsWith("http") ? u : (u ? `${BACKEND}${u}` : null));

    const isContinuous = design?.panel_variant === "continuous" && Array.isArray(design.texture_urls) && design.texture_urls.length > 0;

    if (isContinuous) {
      const zip = new JSZip();
      const urls = design.texture_urls.map((u) => toAbsolute(u));

      // Try fetching all blobs; if any fetch fails, fall back to opening URLs in new tabs
      try {
        await Promise.all(
          urls.map(async (url, idx) => {
            const blob = await fetchBlob(url);
            const ext = (url.split('.').pop() || 'jpg').split('?')[0];
            zip.file(`${design.design_code || 'panel'}-${idx + 1}.${ext}`, blob);
          })
        );
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        saveAs(zipBlob, `${design.design_code || 'panel'}.zip`);
      } catch (err) {
        // fallback: open each URL in a new tab so user can save manually
        console.error('Zip download failed, opening sources instead:', err);
        toast?.error?.('Panel download failed; opening sources in new tabs');
        urls.forEach((u) => u && window.open(u, '_blank'));
      }
    } else {
      // Single image path: prefer explicit texture_url, else construct from categoryId + design_code
      let url = design.texture_url || (categoryId && design.design_code ? `/static/images/flat-embossed-vmt/panels/${categoryId}/${design.design_code}.jpg` : null);
      if (!url) {
        // Additional fallbacks (vicstrip / other product types)
        if (design?.pattern && design?.color?.id) {
          // vicstrip style
          url = `/static/images/vicstrip/${design.pattern}/${design.color.id}.jpg`;
        }
      }
      if (!url) return;
      const abs = toAbsolute(url);

      try {
        const blob = await fetchBlob(abs);
        const ext = (abs.split('.').pop() || 'jpg').split('?')[0];
        saveAs(blob, `${design.design_code || 'panel'}.${ext}`);
      } catch (err) {
        console.error('Fetch failed for single image, opening in new tab as fallback', err);
        // Provide more info for debugging
        try {
          const resp = await fetch(abs, { method: 'HEAD', mode: 'cors' });
          console.debug('[download] HEAD response', abs, resp.status, resp.type);
        } catch (headErr) {
          console.debug('[download] HEAD failed', headErr);
        }
        window.open(abs, '_blank');
      }
    }
  } catch (err) {
    console.error('downloadPanelImages error', err);
    throw err;
  }
}
