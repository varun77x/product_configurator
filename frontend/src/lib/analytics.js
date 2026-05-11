/**
 * analytics.js
 * ------------
 * Thin wrapper around posthog-js. Implements the analytics layer described
 * in the PRD ("PRD: User Analytics for the UniVicoustic Configurator"):
 *
 *   - Single track() entry point so every event flows through the same
 *     surface (PRD Section 5: "Use a thin in-app analytics.track() wrapper
 *     for consistency").
 *   - Strict opt-in by default (PRD Section 6: "GDPR-compliant cookie
 *     consent banner"). PostHog is initialised in opt-out mode so it
 *     captures NOTHING until the user clicks "Accept" in the consent
 *     banner; that flips it to opt-in. Decision persists in localStorage.
 *   - Anonymous user_id + session_id are managed by PostHog itself
 *     (PRD Section 4.1). On login we call identify() so events post-login
 *     stitch to the same user across visits.
 *   - Auto-capture is enabled (clicks, pageviews, web vitals) via PostHog's
 *     default config — covers the device/browser/screen/referrer/UTM/
 *     landing_url metadata listed in Section 4.1 for free.
 *   - Outcomes (Save / Download / Compare / TechSpecs) include the full
 *     configuration snapshot per Section 4.6 — pass it via properties.
 *
 * Module-load behaviour: the only thing that runs on import is
 * `initAnalytics()` getting called once from App.js. If the user hasn't
 * consented, posthog won't send anything until consent flips to "yes".
 */

import posthog from "posthog-js";

const POSTHOG_KEY = process.env.REACT_APP_POSTHOG_KEY;
const POSTHOG_HOST = process.env.REACT_APP_POSTHOG_HOST || "https://us.i.posthog.com";

const CONSENT_KEY = "uv_analytics_consent"; // 'granted' | 'denied'  (or absent)

let initialized = false;

// ── Consent helpers ─────────────────────────────────────────────────────────
export function getConsent() {
  try {
    return localStorage.getItem(CONSENT_KEY); // null | 'granted' | 'denied'
  } catch {
    return null;
  }
}
export function hasDecidedConsent() {
  return getConsent() !== null;
}
export function hasGrantedConsent() {
  return getConsent() === "granted";
}

/** Persist the user's consent choice and flip PostHog opt-in/out accordingly. */
export function setConsent(granted) {
  try {
    localStorage.setItem(CONSENT_KEY, granted ? "granted" : "denied");
  } catch { /* private mode etc. — non-fatal */ }
  if (!initialized) return;
  if (granted) {
    posthog.opt_in_capturing();
  } else {
    posthog.opt_out_capturing();
  }
  // Custom event so other React components (e.g. consent banner) can react.
  window.dispatchEvent(new CustomEvent("uv-consent-changed"));
}

/** Subscribe to consent changes. Returns an unsubscribe fn. */
export function onConsentChange(handler) {
  const listener = () => handler(getConsent());
  window.addEventListener("uv-consent-changed", listener);
  return () => window.removeEventListener("uv-consent-changed", listener);
}

// ── Initialisation ──────────────────────────────────────────────────────────
/**
 * Initialise PostHog once on app boot. Safe to call multiple times — second
 * call is a no-op. If REACT_APP_POSTHOG_KEY is missing (e.g. local dev
 * without analytics) the function returns silently and every subsequent
 * call to track()/identify() is a no-op too.
 */
export function initAnalytics() {
  if (initialized) return;
  if (!POSTHOG_KEY) {
    // No key → analytics disabled. Useful for local dev where you don't
    // want to pollute the prod dashboard with engineer activity.
    // eslint-disable-next-line no-console
    console.info("[analytics] REACT_APP_POSTHOG_KEY not set — tracking disabled.");
    return;
  }

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    // Strict opt-in: don't capture anything until the user accepts the
    // consent banner. Once setConsent(true) runs, PostHog flushes the
    // backlog and starts streaming events.
    opt_out_capturing_by_default: true,
    // Capture clicks/inputs automatically (covers most of PRD 4.2's events
    // as a backup) — our explicit track() calls give us named, queryable
    // events on top of this.
    autocapture: true,
    // Web Vitals (LCP, CLS, INP) — free perf monitoring, useful given the
    // recent giant-PNG render issues.
    capture_performance: true,
    // Pageviews are sent automatically on URL change. Single-page-app
    // navigation is tracked too because we use react-router (PostHog hooks
    // history.pushState).
    capture_pageview: true,
    capture_pageleave: true,
    // Persist user/session ids in localStorage so a returning visitor is
    // recognised as the same anonymous user (PRD 4.1).
    persistence: "localStorage+cookie",
    // Don't auto-record sessions — the PRD scopes session replay to Phase 3.
    // Flip the toggle in the PostHog UI when ready, no code change needed.
    disable_session_recording: true,
    loaded: (ph) => {
      // If the user previously granted consent, flip opt-in immediately so
      // events from THIS session start flowing without waiting on a click.
      if (hasGrantedConsent()) ph.opt_in_capturing();
    },
  });

  initialized = true;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * track(eventName, properties)
 *
 * Single entry point for every analytics event in the app (PRD Section 5).
 * Properties merge with PostHog's auto-collected metadata. Passing the full
 * configuration snapshot via `properties` is how PRD Section 4.6 outcomes
 * stay sliceable by any dimension.
 *
 * Safe to call before consent is granted — PostHog will just drop the
 * event silently. Also safe when POSTHOG_KEY is missing.
 */
export function track(eventName, properties = {}) {
  if (!initialized) return;
  posthog.capture(eventName, properties);
}

/**
 * identify(userId, traits?)
 *
 * Stitch the anonymous session to a known user after login (PRD Section
 * 4.1). userId here is the auth user's database id. Traits are optional
 * extra info to attach to the user profile (email, etc.).
 */
export function identify(userId, traits = {}) {
  if (!initialized) return;
  if (!userId) return;
  posthog.identify(String(userId), traits);
}

/** Wipe the identified user (call on logout). */
export function resetAnalytics() {
  if (!initialized) return;
  posthog.reset();
}

/** Convenience accessor for advanced use (custom posthog APIs). */
export { posthog };
