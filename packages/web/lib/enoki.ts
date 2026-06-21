// Enoki zkLogin + sponsored-gas config. Both values are PUBLIC client-side identifiers
// (the Enoki "public" API key and the Google OAuth client id are meant to ship in the
// frontend), so they live in NEXT_PUBLIC_* vars. When either is missing, ENOKI_ENABLED is
// false and the UI simply omits "Sign in with Google" — wallet connect still works.
export const ENOKI_API_KEY = process.env.NEXT_PUBLIC_ENOKI_API_KEY ?? "";
export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
export const ENOKI_ENABLED = Boolean(ENOKI_API_KEY && GOOGLE_CLIENT_ID);

// The OAuth popup lands here after Google; the page mounts under <Providers>, so the Enoki
// wallet's initializer completes the flow and posts back to the opener. Must be registered
// verbatim in BOTH the Google console (Authorized redirect URIs) and the Enoki portal.
export const ENOKI_REDIRECT_PATH = "/auth";
