"use client";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  Activity, ExternalLink, Cpu, PenLine, ShieldCheck, Boxes, Waves, ArrowUpRight,
} from "lucide-react";
import { FLOE_ADDRESSES } from "@floe/sdk/browser";
import { useVolSurface, tenorLabel, tteDays } from "@/lib/hooks/useVolSurface";
import { suiObject } from "@/lib/explorer";
import { shortAddr } from "@/lib/format";
import { SmileChart } from "@/components/vol/SmileChart";
import { TermStructure } from "@/components/vol/TermStructure";

// 3D canvas is client-only (WebGL) — never SSR it.
const VolSurface3D = dynamic(() => import("@/components/vol/VolSurface3D"), { ssr: false });

const VOL = FLOE_ADDRESSES.testnet.vol;
const PREDICT = FLOE_ADDRESSES.testnet.predict;

const STEPS = [
  { n: "01", Icon: Boxes, t: "Source", d: "DeepBook Predict publishes a Block-Scholes SVI oracle per expiry on-chain — five parameters (a, b, ρ, m, σ) that define a whole smile." },
  { n: "02", Icon: Activity, t: "Reconstruct", d: "We read every live oracle and evaluate w(k) = a + b·(ρ(k−m) + √((k−m)²+σ²)) across moneyness and tenor — the full surface, not just one number." },
  { n: "03", Icon: Cpu, t: "Compute on-chain", d: "floe_vol_index::vol_now computes ATM IV synchronously inside any transaction — a composable volatility primitive any protocol can call for gas-free." },
  { n: "04", Icon: PenLine, t: "Attest", d: "The enclave signs the reading under intent 2; floe_vol_index verifies the signature on-chain — a vol number the ecosystem can trust, not assert." },
];

function Stat({ k, v, accent, sub }: { k: string; v: string; accent?: boolean; sub?: string }) {
  return (
    <div className="kpi">
      <span className="kpi__k">{k}</span>
      <span className={`kpi__v${accent ? " kpi__v--accent" : ""}`}>{v}</span>
      {sub && <span className="vol-kpi__sub">{sub}</span>}
    </div>
  );
}

export default function VolPage() {
  const { data, isLoading, error } = useVolSurface("BTC");
  const slices = data?.slices ?? [];

  // default selection: the live expiry nearest ~7 days (a representative weekly tenor)
  const defaultIdx = useMemo(() => {
    if (!slices.length) return 0;
    let best = 0, bd = Infinity;
    slices.forEach((s, i) => { const d = Math.abs(tteDays(s) - 7); if (d < bd) { bd = d; best = i; } });
    return best;
  }, [slices]);
  const [sel, setSel] = useState<number | null>(null);
  const index = Math.min(sel ?? defaultIdx, Math.max(slices.length - 1, 0));
  const slice = slices[index] ?? null;

  const frontAtm = slices[0] ? slices[0].atmIvBps / 100 : 0;
  const attested = data?.attested ?? null;
  const spot = data?.surface.spot ?? slice?.spot ?? 0;

  return (
    <div className="vol">
      <div className="page-head">
        <div>
          <div className="floe-eyebrow">The moat · Composable volatility</div>
          <h1 className="page-head__title">Surface Studio</h1>
          <p className="page-head__sub">
            The live implied-volatility surface for Sui — reconstructed entirely on-chain. Every expiry is a
            DeepBook Predict SVI oracle; Floe reads all of them and rebuilds the full smile across moneyness and
            tenor. The same primitive the contract uses, <code>floe_vol_index::vol_now</code>, is callable by any
            protocol — and the enclave signs it so the number is <strong>proven, not asserted</strong>.
          </p>
        </div>
        <div className="kpi-strip">
          <Stat k="Floe Index · BTC ATM IV" v={frontAtm ? `${frontAtm.toFixed(2)}%` : "—"} accent sub="front expiry" />
          <Stat k="BTC spot" v={spot ? `$${spot.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"} />
          <Stat k="Live expiries" v={slices.length ? String(slices.length) : "—"} sub="on-chain SVI oracles" />
          <Stat
            k="Attested index"
            v={attested ? (attested.fresh ? "Fresh" : "Proven") : "—"}
            accent={!!attested?.fresh}
            sub={attested ? `${(Number(attested.volBps) / 100).toFixed(2)}% signed` : "intent 2"}
          />
        </div>
      </div>

      {/* The surface */}
      <section className="floe-panel vol-hero">
        <div className="floe-panel__head">
          <div className="floe-panel__title"><Waves size={15} /> BTC implied-volatility surface</div>
          <div className="floe-panel__sub">
            {slices.length ? `${slices.length} live expiries · ${tenorLabel(slices[0])}–${tenorLabel(slices[slices.length - 1])}` : "resolving live oracles…"} · DeepBook Predict
          </div>
        </div>

        {isLoading && (
          <div className="vol-state"><span className="state-line__spinner" /> Reconstructing the surface from on-chain SVI oracles…</div>
        )}
        {error && (
          <div className="vol-state" style={{ color: "var(--stale)" }}>Could not read oracles — {(error as Error).message}</div>
        )}

        {!isLoading && !error && slices.length > 0 && data && (
          <div className="vol-hero__grid">
            <div className="vol-hero__canvas">
              <VolSurface3D surface={data.surface} index={index} />
              <div className="vol-legend">
                <span className="vol-legend__label">IV</span>
                <span className="vol-legend__bar" />
                <span className="vol-legend__lo">{data.surface.ivMin.toFixed(0)}%</span>
                <span className="vol-legend__hi">{data.surface.ivMax.toFixed(0)}%</span>
              </div>
            </div>
            <aside className="vol-hero__side">
              <div className="vol-side__h">Expiry</div>
              <div className="vol-chips">
                {slices.map((s, i) => (
                  <button
                    key={s.oracleId}
                    className={`vol-chip${i === index ? " is-active" : ""}`}
                    onClick={() => setSel(i)}
                  >
                    {tenorLabel(s)}
                  </button>
                ))}
              </div>
              {slice && (
                <div className="vol-readout">
                  <Row k="Tenor" v={`${tteDays(slice).toFixed(2)} days`} />
                  <Row k="ATM IV" v={`${(slice.atmIvBps / 100).toFixed(2)}%`} accent />
                  <Row k="Forward" v={`$${slice.forward.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
                  <Row k="Oracle" v={shortAddr(slice.oracleId)} href={suiObject(slice.oracleId)} />
                </div>
              )}
              <a className="vol-side__cta" href={suiObject(VOL.volIndex)} target="_blank" rel="noreferrer">
                Floe Index on-chain <ArrowUpRight size={13} />
              </a>
            </aside>
          </div>
        )}
      </section>

      {/* Smile + term structure */}
      {!isLoading && !error && slices.length > 0 && (
        <div className="vol-2col">
          <section className="floe-panel">
            <div className="floe-panel__head">
              <div className="floe-panel__title">Volatility smile</div>
              <div className="floe-panel__sub">{slice ? `${tenorLabel(slice)} expiry · IV vs log-moneyness` : ""}</div>
            </div>
            <div className="vol-chart-wrap"><SmileChart slice={slice} /></div>
          </section>
          <section className="floe-panel">
            <div className="floe-panel__head">
              <div className="floe-panel__title">Term structure</div>
              <div className="floe-panel__sub">ATM IV across {slices.length} live expiries · click a point</div>
            </div>
            <div className="vol-chart-wrap"><TermStructure slices={slices} index={index} onSelect={setSel} /></div>
          </section>
        </div>
      )}

      {/* SVI params inspector */}
      {slice && (
        <section className="floe-panel vol-svi">
          <div className="floe-panel__head">
            <div className="floe-panel__title">SVI parameters · {tenorLabel(slice)} slice</div>
            <div className="floe-panel__sub">raw Gatheral parameterization · scale 1e9 on-chain</div>
          </div>
          <div className="vol-svi__grid">
            <Param sym="a" name="level" val={slice.a.toFixed(6)} />
            <Param sym="b" name="angle" val={slice.b.toFixed(6)} />
            <Param sym="ρ" name="skew" val={slice.rho.toFixed(6)} />
            <Param sym="m" name="shift" val={slice.m.toFixed(6)} />
            <Param sym="σ" name="curvature" val={slice.sigma.toFixed(6)} />
          </div>
          <div className="vol-formula">
            <span className="vol-formula__eq">w(k) = a + b · ( ρ(k − m) + √((k − m)² + σ²) )</span>
            <span className="vol-formula__eq vol-formula__eq--dim">IV(k) = √( w(k) / T ) &nbsp;·&nbsp; T = time-to-expiry in years</span>
          </div>
        </section>
      )}

      {/* How it's computed */}
      <section>
        <div className="vol-section-head">
          <h2 className="vol-h2">A volatility primitive, proven on-chain</h2>
          <p>From DeepBook Predict's oracle to a signed reading any protocol can compose against — four steps, no trusted feeder.</p>
        </div>
        <div className="vol-steps">
          {STEPS.map((s) => (
            <div key={s.n} className="vol-step">
              <span className="vol-step__n">{s.n}</span>
              <s.Icon className="vol-step__icon" size={20} />
              <span className="vol-step__t">{s.t}</span>
              <span className="vol-step__d">{s.d}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Provenance footer */}
      <div className="vol-prov">
        <ShieldCheck size={15} />
        <span>
          The on-chain ATM number Floe reports is signed by the registered enclave under intent 2 and verified by{" "}
          <a href={suiObject(VOL.volIndex)} target="_blank" rel="noreferrer">floe_vol_index <ExternalLink size={11} /></a>.
          Source oracles are <a href={suiObject(PREDICT.package)} target="_blank" rel="noreferrer">DeepBook Predict <ExternalLink size={11} /></a> — verify any expiry above.
        </span>
      </div>
    </div>
  );
}

function Row({ k, v, accent, href }: { k: string; v: string; accent?: boolean; href?: string }) {
  return (
    <div className="vol-readout__row">
      <span className="vol-readout__k">{k}</span>
      {href ? (
        <a className="vol-readout__v vol-readout__v--link" href={href} target="_blank" rel="noreferrer">{v} <ExternalLink size={11} /></a>
      ) : (
        <span className={`vol-readout__v${accent ? " is-accent" : ""}`}>{v}</span>
      )}
    </div>
  );
}

function Param({ sym, name, val }: { sym: string; name: string; val: string }) {
  return (
    <div className="vol-param">
      <span className="vol-param__sym">{sym}</span>
      <span className="vol-param__name">{name}</span>
      <span className="vol-param__val">{val}</span>
    </div>
  );
}
