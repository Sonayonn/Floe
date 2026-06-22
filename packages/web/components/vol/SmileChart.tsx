"use client";
import { useMemo } from "react";
import { sviIvBps, type SVISlice } from "@floe/sdk/browser";

/* The implied-vol smile for one expiry: IV(%) vs log-moneyness, drawn from the slice's
   SVI params so it's the continuous curve, not just sampled points. ATM (k=0) marked. */

const W = 520, H = 240, PADL = 44, PADR = 16, PADT = 18, PADB = 34;
const KMIN = -0.4, KMAX = 0.4, N = 96;

export function SmileChart({ slice }: { slice: SVISlice | null }) {
  const model = useMemo(() => {
    if (!slice) return null;
    const pts = Array.from({ length: N }, (_, i) => {
      const k = KMIN + (KMAX - KMIN) * (i / (N - 1));
      return { k, iv: sviIvBps(slice, k) / 100 };
    });
    let lo = Infinity, hi = -Infinity;
    for (const p of pts) { if (p.iv < lo) lo = p.iv; if (p.iv > hi) hi = p.iv; }
    const pad = (hi - lo) * 0.15 || 1;
    lo = Math.max(0, lo - pad); hi = hi + pad;
    const atm = sviIvBps(slice, 0) / 100;
    return { pts, lo, hi, atm };
  }, [slice]);

  if (!slice || !model) return <div className="vol-chart vol-chart--empty">No live expiry.</div>;

  const { pts, lo, hi, atm } = model;
  const sx = (k: number) => PADL + ((k - KMIN) / (KMAX - KMIN)) * (W - PADL - PADR);
  const sy = (iv: number) => PADT + (1 - (iv - lo) / (hi - lo || 1)) * (H - PADT - PADB);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${sx(p.k).toFixed(1)},${sy(p.iv).toFixed(1)}`).join(" ");
  const area = `${path} L${sx(KMAX).toFixed(1)},${(H - PADB).toFixed(1)} L${sx(KMIN).toFixed(1)},${(H - PADB).toFixed(1)} Z`;
  const yticks = 4, xticks = [-0.4, -0.2, 0, 0.2, 0.4];

  return (
    <svg className="vol-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Volatility smile">
      <defs>
        <linearGradient id="smileFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#34e6d6" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#34e6d6" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* y grid + labels */}
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
      {/* x labels + ATM line */}
      {xticks.map((k) => (
        <text key={k} x={sx(k)} y={H - PADB + 18} className="vol-tick vol-tick--x">{k === 0 ? "ATM" : k.toFixed(1)}</text>
      ))}
      <line x1={sx(0)} y1={PADT} x2={sx(0)} y2={H - PADB} className="vol-atm-line" />
      {/* curve */}
      <path d={area} fill="url(#smileFill)" />
      <path d={path} className="vol-curve" />
      {/* ATM dot */}
      <circle cx={sx(0)} cy={sy(atm)} r={4.5} className="vol-atm-dot" />
      <text x={sx(0) + 8} y={sy(atm) - 8} className="vol-atm-label">{atm.toFixed(1)}%</text>
    </svg>
  );
}
