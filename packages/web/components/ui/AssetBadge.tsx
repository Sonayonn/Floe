import { logoFor } from "./Logo";

/** Token identity disc + symbol. Uses the official asset logo when available
 *  (e.g. USDC for the demo dUSDC), else a tinted initials disc. */
const TINT: Record<string, { from: string; to: string; fg: string }> = {
  sui: { from: "#5ea9ff", to: "#3b82c4", fg: "#eaf4f5" },
};

export function AssetBadge({
  symbol,
  size = 24,
  showSymbol = true,
}: {
  symbol: string;
  size?: number;
  showSymbol?: boolean;
}) {
  const src = logoFor(symbol);
  const key = symbol.toLowerCase();
  const t = TINT[key] ?? { from: "var(--surface-raised)", to: "var(--bg-deep)", fg: "var(--text)" };
  const initials = symbol.replace(/^[a-z]+/, "").slice(0, 2).toUpperCase() || symbol.slice(0, 2).toUpperCase();
  return (
    <span className="asset-badge">
      {src ? (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          style={{ width: size, height: size, borderRadius: "50%", objectFit: "contain", display: "block" }}
        />
      ) : (
        <span
          className="asset-badge__disc"
          style={{ width: size, height: size, background: `linear-gradient(150deg, ${t.from}, ${t.to})`, color: t.fg, fontSize: size * 0.38 }}
        >
          {initials}
        </span>
      )}
      {showSymbol && <span className="asset-badge__sym">{symbol}</span>}
    </span>
  );
}
