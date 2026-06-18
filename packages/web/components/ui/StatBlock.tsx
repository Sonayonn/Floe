export function StatBlock({ label, value, sub, accent = false, size = 24 }: {
  label: string; value: string; sub?: string; accent?: boolean; size?: number;
}) {
  return (
    <div className="k-stat">
      <div className="k-stat__label">{label}</div>
      <div className="k-stat__val floe-tnum" style={{ fontSize: size, color: accent ? "var(--accent)" : "var(--text)" }}>{value}</div>
      {sub && <div className="k-stat__sub">{sub}</div>}
    </div>
  );
}
