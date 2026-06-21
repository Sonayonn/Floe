"use client";
import { useEffect } from "react";

// OAuth redirect landing. The Google sign-in popup lands here; this page mounts under <Providers>,
// so RegisterEnokiWallets runs and the Enoki wallet initializer reads the auth response from the
// URL, posts the result back to the opener window, and the popup closes itself. If a user somehow
// reaches this in the main tab (no opener), bounce them home after a beat.
export default function AuthCallback() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.opener) {
      const t = setTimeout(() => window.location.replace("/"), 1200);
      return () => clearTimeout(t);
    }
  }, []);

  return (
    <div className="auth-callback">
      <div className="state-line"><span className="state-line__spinner" /> Completing sign-in…</div>
    </div>
  );
}
