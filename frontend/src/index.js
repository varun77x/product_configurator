import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

// Suppress benign ResizeObserver loop notification that React's dev overlay
// incorrectly surfaces as a blocking uncaught error.
const _origOnError = window.onerror;
window.onerror = (msg, source, line, col, err) => {
  if (typeof msg === "string" && msg.includes("ResizeObserver loop")) {
    return true; // prevent the error from bubbling
  }
  return _origOnError?.(msg, source, line, col, err);
};

// ── Page-load performance timing ────────────────────────────────────────────
const _pageStart = performance.now();
window.addEventListener("DOMContentLoaded", () =>
  console.log(`%c⏱ [PERF] DOMContentLoaded  +${(performance.now() - _pageStart).toFixed(0)}ms`, "color:#ffb74d;font-weight:bold")
);
window.addEventListener("load", () =>
  console.log(`%c⏱ [PERF] window.load (all assets)  +${(performance.now() - _pageStart).toFixed(0)}ms`, "color:#ff8a65;font-weight:bold")
);

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
