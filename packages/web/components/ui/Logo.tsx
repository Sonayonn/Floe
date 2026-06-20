import { VenueIcon } from "./VenueIcon";

/** Official protocol / asset logos (downloaded to /public/logos — no runtime hotlinking).
 *  Keyed by venue key, asset symbol, or brand name. */
export const LOGO_SRC: Record<string, string> = {
  sui: "/logos/sui.svg",
  usdc: "/logos/usdc.svg",
  dusdc: "/logos/usdc.svg",
  cetus: "/logos/cetus.png",
  deepbook: "/logos/deepbook.jpg",
  // 'lending' (Floe Lend) intentionally has NO logo entry → falls back to the Floe-drawn
  // money-market glyph in VenueIcon. It is Floe's OWN money market, not a third party (Suilend).
  floe: "/logos/floe.svg",
  share: "/logos/floe.svg",
  flshare: "/logos/floe.svg",
  idle: "/logos/floe.svg",
  walrus: "/logos/walrus.svg",
  seal: "/logos/seal.png",
  nautilus: "/logos/nautilus.svg",
};

export function logoFor(key: string | undefined): string | undefined {
  return key ? LOGO_SRC[key.toLowerCase()] : undefined;
}

/** Raw official logo as a round mark. Returns null if we don't have one. */
export function Logo({ name, size = 20, title }: { name: string; size?: number; title?: string }) {
  const src = logoFor(name);
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      title={title}
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: "contain", display: "block", borderRadius: src.endsWith(".svg") ? 0 : "50%" }}
    />
  );
}

/** Venue identity disc: official logo when we have one (DeepBook, Cetus, Sui Lending),
 *  else the Floe-drawn glyph in a bordered disc (e.g. idle reserve). */
export function VenueMark({
  venueKey,
  size = 24,
  live = true,
  title,
}: {
  venueKey: string;
  size?: number;
  live?: boolean;
  title?: string;
}) {
  const src = logoFor(venueKey);
  if (src) {
    return (
      <img
        src={src}
        alt=""
        title={title}
        width={size}
        height={size}
        style={{ width: size, height: size, objectFit: "contain", display: "block", borderRadius: "50%", opacity: live ? 1 : 0.5 }}
      />
    );
  }
  return (
    <span className="venue-mix__dot" data-live={live} title={title} style={{ width: size, height: size }}>
      <VenueIcon venue={venueKey} size={Math.round(size * 0.54)} />
    </span>
  );
}
