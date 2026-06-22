"use client";
import { useEffect } from "react";
import Link from "next/link";
import { Brand } from "@/components/shell/Brand";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="err">
      <div className="err__card floe-panel">
        <Link href="/" className="err__brand" aria-label="Floe home"><Brand size={28} /></Link>
        <div className="floe-eyebrow err__eyebrow--warn">Something cracked</div>
        <h1 className="err__title">An unexpected error occurred.</h1>
        <p className="err__sub">
          This is on us, not your funds — Floe is non-custodial, so your assets stay safe on-chain. Try again, or head back.
        </p>
        {error.digest && <code className="err__digest">ref {error.digest}</code>}
        <div className="err__actions">
          <button className="auth-cta" onClick={reset}>Try again</button>
          <Link href="/" className="err__ghost">Back to landing</Link>
        </div>
      </div>
    </div>
  );
}
