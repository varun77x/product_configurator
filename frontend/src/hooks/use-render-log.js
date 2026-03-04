import { useRef } from "react";

/**
 * useRenderLog
 * Drop this into any component to get console output on every render:
 *   - render count
 *   - ms since last render
 *   - which tracked values changed and what they changed to
 *
 * Usage:
 *   useRenderLog("MyComponent", { prop1, prop2, someState });
 */
export function useRenderLog(componentName, trackedValues = {}) {
  const renderCount = useRef(0);
  const lastRenderTime = useRef(performance.now());
  const prevValues = useRef(trackedValues);

  renderCount.current += 1;

  const now = performance.now();
  const msSinceLast = (now - lastRenderTime.current).toFixed(1);
  lastRenderTime.current = now;

  const changedKeys = Object.keys(trackedValues).filter(
    (k) => trackedValues[k] !== prevValues.current[k]
  );

  const changed = Object.fromEntries(
    changedKeys.map((k) => [
      k,
      { from: prevValues.current[k], to: trackedValues[k] },
    ])
  );

  prevValues.current = trackedValues;

  const label =
    renderCount.current === 1
      ? `%c⚡ [RENDER] ${componentName}  #1  (mount)`
      : `%c⚡ [RENDER] ${componentName}  #${renderCount.current}  +${msSinceLast}ms`;

  const style =
    renderCount.current === 1
      ? "color:#81c784;font-weight:bold"
      : msSinceLast < 50
      ? "color:#ff8a65;font-weight:bold"  // fast re-render — suspicious
      : "color:#4fc3f7;font-weight:bold";

  if (changedKeys.length > 0) {
    console.log(label, style, changed);
  } else {
    console.log(label, style);
  }
}

/**
 * logImageLoad
 * Call this before starting to load an image.
 * Returns a pair of callbacks: { onLoad, onError }
 * that log the result + timing to the console.
 */
export function logImageLoad(label, src) {
  const start = performance.now();
  return {
    onLoad: () => {
      const ms = (performance.now() - start).toFixed(0);
      console.log(
        `%c🖼 [IMG LOAD] ${label}  ✓ ${ms}ms\n  ${src}`,
        "color:#a5d6a7"
      );
    },
    onError: () => {
      const ms = (performance.now() - start).toFixed(0);
      console.warn(`🖼 [IMG ERR]  ${label}  ✗ ${ms}ms\n  ${src}`);
    },
  };
}
