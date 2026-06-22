import Link from "next/link";
import { Brand } from "@/components/shell/Brand";

export default function NotFound() {
  return (
    <div className="err">
      <div className="err__card floe-panel">
        <Link href="/" className="err__brand" aria-label="Floe home"><Brand size={28} /></Link>
        <div className="floe-eyebrow">404 · off the map</div>
        <h1 className="err__title">This page drifted away.</h1>
        <p className="err__sub">The route you&rsquo;re looking for isn&rsquo;t here. The ice is solid back in the app.</p>
        <div className="err__actions">
          <Link href="/" className="auth-cta">Back to landing</Link>
          <Link href="/earn" className="err__ghost">Go to Earn</Link>
        </div>
      </div>
    </div>
  );
}
