import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { getToken, onAuthChange } from "@/lib/auth";

/**
 * AuthGuard
 * ---------
 * Wraps a route element so unauthenticated users are bounced to /login.
 * Renders the children only when a token is present in localStorage. The
 * token isn't validated against the server here — for that we rely on
 * /api/auth/me being called explicitly elsewhere or on individual
 * authenticated requests returning 401, which causes lib/auth.js to wipe
 * the cache (and the next render here flips to the redirect).
 *
 * The attempted path is stashed in location.state.from so AuthScreen can
 * land the user back where they tried to go after sign-in.
 *
 * Usage:
 *   <Route path="/" element={<AuthGuard><Configurator /></AuthGuard>} />
 */
export default function AuthGuard({ children }) {
  const [isAuthed, setIsAuthed] = useState(() => !!getToken());
  const location = useLocation();

  // Re-check auth state whenever lib/auth.js dispatches a change (login,
  // logout, cross-tab update). Cheap — just reads localStorage.
  useEffect(() => onAuthChange(() => setIsAuthed(!!getToken())), []);

  if (!isAuthed) {
    return (
      <Navigate
        to="/login"
        state={{ from: location.pathname + location.search }}
        replace
      />
    );
  }
  return children;
}

/**
 * RedirectIfAuthed
 * ----------------
 * Mirror image of AuthGuard. Wraps /login so a user who is already
 * authenticated doesn't see the auth screen — they get sent back to /
 * (or wherever they came from) instead.
 */
export function RedirectIfAuthed({ children }) {
  const [isAuthed, setIsAuthed] = useState(() => !!getToken());
  useEffect(() => onAuthChange(() => setIsAuthed(!!getToken())), []);

  if (isAuthed) return <Navigate to="/" replace />;
  return children;
}
