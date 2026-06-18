"use client";
import { useId, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Droplets, Repeat } from "lucide-react";
import type { VaultState } from "@floe/sdk/browser";
import { useVaultHistory } from "@/lib/hooks/useVaultHistory";
import { fmtDay, fmtRelative, pctSigned } from "@/lib/format";

type Pt = { t: number; v: number };

/* ── tiny SVG charts (no deps) — honest about sparse data ───────────────── */

function Bars({ data }: { data: Pt[] }) {
  const w = 320, h = 96, gap = 3;
  if (!data.length) return null;
  const max = Math.max(...data.map((d) => d.v), 1e-9);
  const min = Math.min(...data.map((d) => d.v), 0);
  const range = max - min || max || 1;
  const n = data.length;
  const bw = (w - gap * (n - 1)) / n;
  return (
    <svg className="le-chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="TVL over time">
      {data.map((d, i) => {
        const bh = Math.max(2, ((d.v - min) / range) * (h - 6));
        const last = i === n - 1;
        return (
          <rect
            key={i}
            x={i * (bw + gap)}
            y={h - bh}
            width={bw}
            height={bh}
            rx={1.5}
            fill={last ? "var(--accent)" : "var(--accent-deep)"}
            opacity={last ? 1 : 0.5}
          />
        );
      })}
    </svg>
  );
}

function Line({ data, tone = "accent" }: { data: Pt[]; tone?: "accent" | "loss" }) {
  const gid = useId();
  const w = 520, h = 150, pad = 6;
  const stroke = tone === "loss" ? "var(--loss)" : "var(--accent)";
  const geom = useMemo(() => {
    if (data.length < 2) return null;
    const xs = data.map((d) => d.t);
    const ys = data.map((d) => d.v);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const rx = maxX - minX || 1, ry = maxY - minY || Math.abs(maxY) || 1;
    const px = (x: number) => pad + ((x - minX) / rx) * (w - pad * 2);
    const py = (y: number) => h - pad - ((y - minY) / ry) * (h - pad * 2);
    const pts = data.map((d) => `${px(d.t).toFixed(1)},${py(d.v).toFixed(1)}`);
    return { line: `M${pts.join("L")}`, area: `M${pts.join("L")}L${px(maxX).toFixed(1)},${h}L${px(minX).toFixed(1)},${h}Z`, lastX: px(maxX), lastY: py(ys[ys.length - 1]) };
  }, [data]);

  if (!geom) {
    // single real point — draw a flat marker rather than fake a slope
    return (
      <svg className="le-chart le-chart--line" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="Share price">
        <line x1={pad} y1={h / 2} x2={w - pad} y2={h / 2} stroke="var(--border-strong)" strokeDasharray="4 5" strokeWidth={1} />
        {data[0] && <circle cx={w - pad} cy={h / 2} r={3.5} fill={stroke} />}
      </svg>
    );
  }
  return (
    <svg className="le-chart le-chart--line" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="Share price over time">
      <defs>
        <linearGradient id={`fill-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.22} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={geom.area} fill={`url(#fill-${gid})`} />
      <path d={geom.line} fill="none" stroke={stroke} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={geom.lastX} cy={geom.lastY} r={3.5} fill={stroke} />
    </svg>
  );
}

function Axis({ data }: { data: Pt[] }) {
  if (data.length < 2) return null;
  const first = data[0].t, last = data[data.length - 1].t, mid = (first + last) / 2;
  return (
    <div className="le-axis">
      <span>{fmtDay(first)}</span>
      <span>{fmtDay(mid)}</span>
      <span>{fmtDay(last)}</span>
    </div>
  );
}

function GrowthChip({ label, value }: { label: string; value: number | null }) {
  const tone = value == null ? "muted" : value >= 0 ? "pos" : "neg";
  return (
    <div className={`le-chip le-chip--${tone}`}>
      <span className="le-chip__k">{label}</span>
      <span className="le-chip__v">{value == null ? "—" : pctSigned(value)}</span>
    </div>
  );
}

/* ── section ────────────────────────────────────────────────────────────── */

export function LiquidityEarnings({ vaultId, live }: { vaultId: string; live: VaultState }) {
  const { data: h, isLoading } = useVaultHistory(vaultId, live);
  const [tab, setTab] = useState<"price" | "yield">("price");

  const livePrice = Number(live.sharePrice) / 1e6;
  const tvlData: Pt[] = h?.tvlSeries ?? [{ t: Date.now(), v: 0 }];
  const netDeposited = tvlData.length ? tvlData[tvlData.length - 1].v : 0;

  const priceData: Pt[] = h?.priceSeries ?? [];
  const firstPrice = priceData[0]?.v ?? livePrice;
  const yieldData: Pt[] = priceData.map((p) => ({ t: p.t, v: firstPrice > 0 ? p.v / firstPrice - 1 : 0 }));

  // change since the previous on-chain observation
  const prev = priceData.length >= 2 ? priceData[priceData.length - 2].v : null;
  const changeSince = prev != null && prev > 0 ? livePrice / prev - 1 : null;
  const cumYield = firstPrice > 0 ? livePrice / firstPrice - 1 : 0;

  const series = tab === "price" ? priceData : yieldData;
  const lossTone = tab === "yield" ? cumYield < 0 : (changeSince ?? 0) < 0;
  const headline = tab === "price" ? livePrice.toFixed(4) : pctSigned(cumYield);

  return (
    <section className="le">
      <h2 className="le__title">Liquidity and Earnings</h2>
      <div className="le__grid">
        {/* ── TVL ── */}
        <div className="le-card">
          <div className="le-card__head">
            <span className="le-card__label"><Droplets size={14} /> Net deposits</span>
            <span className="le-card__span">
              {h && h.spanDays >= 1 ? `${Math.round(h.spanDays)}d` : "live"} <Repeat size={11} />
            </span>
          </div>
          <div className="le-card__big floe-tnum">${netDeposited.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div className="le-card__chart">
            {isLoading ? <div className="skel" style={{ height: 96, borderRadius: 8 }} /> : <Bars data={tvlData} />}
          </div>
          <Axis data={tvlData} />
          <p className="le-subtle">Cumulative on-chain deposits − withdrawals. Current NAV is marked below.</p>
        </div>

        {/* ── Share Price / Yield Earned ── */}
        <div className="le-card">
          <div className="le-card__tabs">
            <button className={tab === "price" ? "is-active" : ""} onClick={() => setTab("price")}>Share Price</button>
            <button className={tab === "yield" ? "is-active" : ""} onClick={() => setTab("yield")}>Yield Earned</button>
          </div>
          <div className="le-card__row">
            <div className="le-card__big floe-tnum" style={lossTone ? { color: "var(--loss)" } : undefined}>{headline}</div>
            {tab === "price" && changeSince != null && (
              <span className={`le-delta ${changeSince >= 0 ? "is-pos" : "is-neg"}`}>
                {changeSince >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                {pctSigned(changeSince)} <em>since last update</em>
              </span>
            )}
            <span className="le-updated">
              {h?.lastEventMs ? `Updated ${fmtRelative(h.lastEventMs)}` : "Awaiting first deposit"}
              {live.navFresh && <i className="le-fresh" title="NAV attested within the freshness window">attested</i>}
            </span>
          </div>
          <div className="le-card__chart">
            {isLoading ? <div className="skel" style={{ height: 150, borderRadius: 8 }} /> : <Line data={series} tone={lossTone ? "loss" : "accent"} />}
          </div>
          <Axis data={series} />
          <div className="le-chips">
            <GrowthChip label="7d" value={h?.growth.d7 ?? null} />
            <GrowthChip label="30d" value={h?.growth.d30 ?? null} />
            <GrowthChip label="90d" value={h?.growth.d90 ?? null} />
          </div>
          {h && h.eventCount < 2 && (
            <p className="le-note">History accrues as the vault trades — {h.eventCount} on-chain {h.eventCount === 1 ? "event" : "events"} so far. Every point is real; growth windows show “—” until the chain has enough.</p>
          )}
        </div>
      </div>
    </section>
  );
}
