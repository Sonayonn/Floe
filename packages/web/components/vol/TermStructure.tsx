"use client";
import { useMemo } from "react";
import type { SVISlice } from "@floe/sdk/browser";
import { tteDays } from "@/lib/hooks/useVolSurface";

/* ATM implied vol vs tenor (term structure). One marker per live expiry; the selected
   expiry is highlighted. x-axis uses √days spacing to match the surface's tenor axis. */

const W = 520, H = 240, PADL = 44, PADR = 16, PADT = 18, PADB = 34;

export function TermStructure({
  slices, index, onSelect,
}: { slices: SVISlice[]; index: number; onSelect: (i: number) => void }) {
  const model = useMemo(() => {
    if (slices.length < 1) return null;
    const pts = slices.map((s, i) => ({ i, days: tteDays(s), u: Math.sqrt(Math.max(tteDays(s), 0)), iv: s.atmIvBps / 100 }));
    let lo = Infinity, hi = -Infinity;
    for (const p of pts) { if (p.iv < lo) lo = p.iv; if (p.iv > hi) hi = p.iv; }
    const pad = (hi - lo) * 0.18 || 1;
    lo = Math.max(0, lo - pad); hi = hi + pad;
    const uMax = pts[pts.length - 1].u || 1;
    return { pts, lo, hi, uMax };
  }, [slices]);

  if (!model) return <div className="vol-chart vol-chart--empty">No term structure.</div>;

  const { pts, lo, hi, uMax } = model;
  const sx = (u: number) => PADL + (u / uMax) * (W - PADL - PADR);
  const sy = (iv: number) => PADT + (1 - (iv - lo) / (hi - lo || 1)) * (H - PADT - PADB);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${sx(p.u).toFixed(1)},${sy(p.iv).toFixed(1)}`).join(" ");
  const yticks = 4;
  const xmark = [1, 7, 14, 21].filter((d) => Math.sqrt(d) <= uMax);

  return (
    <svg className="vol-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Volatility term structure">
      {Array.from({ length: yticks + 1 }, (_, i) => {
        const iv = lo + ((hi - lo) * i) / yticks;
        const y = sy(iv);
        return (
          <g key={i}>
            <line x1={PADL} y1={y} x2={W - PADR} y2={y} className="vol-grid" />
            <text x={PADL - 8} y={y + 3} className="vol-tick vol-tick--y">{iv.toFixed(0)}</text>
          </g>
        );
      })}
      {xmark.map((d) => (
        <text key={d} x={sx(Math.sqrt(d))} y={H - PADB + 18} className="vol-tick vol-tick--x">{d}d</text>
      ))}
      <path d={path} className="vol-curve vol-curve--term" />
      {pts.map((p) => (
        <g key={p.i} onClick={() => onSelect(p.i)} style={{ cursor: "pointer" }}>
          <circle cx={sx(p.u)} cy={sy(p.iv)} r={p.i === index ? 6 : 3.5} className={p.i === index ? "vol-term-dot is-sel" : "vol-term-dot"} />
          {p.i === index && <text x={sx(p.u)} y={sy(p.iv) - 12} className="vol-atm-label" textAnchor="middle">{p.iv.toFixed(1)}%</text>}
        </g>
      ))}
    </svg>
  );
}
