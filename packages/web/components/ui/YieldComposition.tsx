export interface YieldLine { label: string; value: string; tone?: "pos" | "neg" | "neutral"; }

export function YieldComposition({ lines, net }: { lines: YieldLine[]; net: { label: string; value: string } }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {lines.map((l) => (
        <div key={l.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
          <span style={{ color: "var(--text-muted)" }}>{l.label}</span>
          <span className="floe-tnum" style={{ fontFamily: "var(--font-mono)", color: l.tone === "neg" ? "var(--loss)" : l.tone === "pos" ? "var(--gain)" : "var(--text)" }}>{l.value}</span>
        </div>
      ))}
      <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 600 }}>
        <span style={{ color: "var(--text)" }}>{net.label}</span>
        <span className="floe-tnum" style={{ fontFamily: "var(--font-mono)", color: "var(--gain)" }}>{net.value}</span>
      </div>
    </div>
  );
}
