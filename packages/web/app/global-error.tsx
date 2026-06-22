"use client";
import { useEffect } from "react";

// global-error replaces the root layout entirely, so global CSS is not guaranteed — styles are inlined,
// matching the graphite + teal theme. Only fires for errors thrown in the root layout itself.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#0C0E12", color: "#ECEEF2", fontFamily: "ui-sans-serif, system-ui, sans-serif", minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <div style={{ maxWidth: 460, padding: "40px 32px", textAlign: "center" }}>
          <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "#ecb45a", marginBottom: 12 }}>
            Something cracked
          </div>
          <h1 style={{ fontSize: 28, margin: "0 0 12px", letterSpacing: "-0.02em" }}>An unexpected error occurred.</h1>
          <p style={{ color: "#9aa1ad", lineHeight: 1.55, margin: "0 0 24px" }}>
            Floe is non-custodial — your assets stay safe on-chain. Please try again.
          </p>
          {error.digest && (
            <code style={{ display: "block", fontFamily: "ui-monospace, monospace", fontSize: 12, color: "#5d6470", marginBottom: 24 }}>
              ref {error.digest}
            </code>
          )}
          <button
            onClick={reset}
            style={{ background: "#34e6d6", color: "#04201d", border: "none", borderRadius: 999, padding: "11px 22px", fontWeight: 600, cursor: "pointer", fontSize: 14 }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
