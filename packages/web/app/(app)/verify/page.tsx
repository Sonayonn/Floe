"use client";
import {
  ExternalLink, Cpu, PenLine, ShieldCheck, ShieldAlert, Ban,
  Layers, Activity, Landmark, ArrowUpRight,
} from "lucide-react";
import { useVaults } from "@/lib/hooks/useVaults";
import { useVol, volPct } from "@/lib/hooks/useVol";
import { ProofBadge, type VaultSafety } from "@/components/ui/ProofBadge";
import { OfficialBadge } from "@/components/ui/OfficialBadge";
import { isOfficial } from "@/lib/official";
import { fmt6, shortAddr } from "@/lib/format";
import { suiObject } from "@/lib/explorer";
import { FLOE_ADDRESSES } from "@floe/sdk/browser";

const NAV = FLOE_ADDRESSES.testnet.nav;
const VOL = FLOE_ADDRESSES.testnet.vol;
const LEND = FLOE_ADDRESSES.testnet.lend;

/** A single root-of-trust fact: label + on-chain link (or a raw measurement). */
function ProofRow({
  label, value, href, sub, raw = false,
}: { label: string; value: string; href?: string; sub?: string; raw?: boolean }) {
  return (
    <div className="vf-prow">
      <span className="vf-prow__k">{label}</span>
      <span className="vf-prow__v">
        {raw || !href ? (
          <span className="vf-prow__hash">{value}</span>
        ) : (
          <a className="vf-prow__link" href={href} target="_blank" rel="noreferrer">
            {value} <ExternalLink size={12} />
          </a>
        )}
        {sub && <span className="vf-prow__sub">{sub}</span>}
      </span>
    </div>
  );
}

const STEPS = [
  { n: "01", Icon: Cpu, t: "Compute", d: "NAV is computed inside an AWS Nitro enclave — idle + every venue position + settled value — never on a server you must trust." },
  { n: "02", Icon: PenLine, t: "Sign", d: "The enclave signs the value under a typed intent tag, so a NAV signature can never be replayed as a collateral or vol one." },
  { n: "03", Icon: ShieldCheck, t: "Verify", d: "floe_nav checks the signature against the enclave's registered code measurement (PCR) on-chain before the value is accepted." },
  { n: "04", Icon: Ban, t: "Refuse", d: "If it can't verify — stale or tampered — the contract refuses to mint and pays withdrawals at the proven floor. Never a trusted number." },
];

const INTENTS = [
  { id: NAV.navIntent, name: "NAV", d: "A vault's net asset value and proven floor.", ok: true },
  { id: NAV.volIntent, name: "Vol", d: "The implied-volatility index, signed for composers.", ok: true },
  { id: NAV.collateralIntent, name: "Collateral", d: "A vault SHARE's value as Floe Lend collateral.", ok: true },
  { id: 4, name: "Risk", d: "Attested PLP / position risk state. Reserved.", ok: false },
];

const CONSUMERS = [
  { Icon: Layers, t: "Vault NAV", fn: "floe_nav::verify_nav", d: "Every vault's redeemable floor is signed and verified before the contract acts on it. The flagship consumer.", href: suiObject(NAV.package) },
  { Icon: Activity, t: "Volatility index", fn: "floe_nav::verify_vol_attested", d: "An implied-vol number the ecosystem can compose against — proven, not asserted.", href: suiObject(VOL.volIndex) },
  { Icon: Landmark, t: "Lending collateral", fn: "floe_nav::verify_collateral_attested", d: "Floe Lend values SHARE collateral from a signed valuation — a borrower can't forge the number.", href: suiObject(LEND.refPool) },
];

export default function VerifyPage() {
  const { data: vaults, isLoading, error } = useVaults();
  const { data: vol } = useVol();
  const volBps = vol ? (vol.liveBps > 0n ? vol.liveBps : vol.indexBps) : 0n;
  const rows = vaults ?? [];
  const attested = rows.filter((v) => v.attested).length;
  const verified = rows.filter((v) => v.navSafetyLabel === "verified").length;

  return (
    <div className="vf">
      <div className="page-head">
        <div>
          <div className="floe-eyebrow">The moat · Verifiable Valuation</div>
          <h1 className="page-head__title">Verify</h1>
          <p className="page-head__sub">
            Most vaults ask you to trust their numbers. Floe proves them. Every NAV — across every venue a vault
            touches — is computed inside a hardware enclave, signed by code whose measurement is registered
            on-chain, and verified by the contract before it is accepted. Don't trust — verify.
          </p>
        </div>
        <div className="kpi-strip">
          <div className="kpi"><span className="kpi__k">Registered enclave</span><span className="kpi__v kpi__v--accent">Live</span></div>
          <div className="kpi"><span className="kpi__k">Floe Index · BTC ATM IV</span><span className="kpi__v kpi__v--accent">{volBps > 0n ? volPct(volBps) : "—"}</span></div>
          <div className="kpi"><span className="kpi__k">Intents proven</span><span className="kpi__v">3 / 4</span></div>
          <div className="kpi"><span className="kpi__k">Vaults attested</span><span className="kpi__v">{rows.length ? `${attested}/${rows.length}` : "—"}</span></div>
        </div>
      </div>

      {/* Root of trust — the registered enclave */}
      <section className="vf-root">
        <div className="vf-root__intro">
          <div className="vf-kicker"><Cpu size={14} /> Root of trust</div>
          <h2 className="vf-h2">The registered enclave</h2>
          <p className="vf-lead">
            One reproducible enclave build signs every figure Floe reports. Its code measurement (PCR0) is
            registered on-chain — a signature is accepted only if it comes from this exact build. Rebuilding the
            enclave yields an identical PCR on a laptop and on EC2, so anyone can reproduce the root of trust.
          </p>
          <div className="vf-verdict">
            <span className="vf-verdict__pill is-ok"><ShieldCheck size={13} /> valid accepted</span>
            <span className="vf-verdict__pill is-no"><ShieldAlert size={13} /> tampered rejected</span>
            <span className="vf-verdict__note">proven on-chain — a forged signature aborts the transaction.</span>
          </div>
        </div>
        <div className="vf-root__facts">
          <ProofRow label="Enclave object" value={shortAddr(NAV.enclave)} href={suiObject(NAV.enclave)} sub="registered AWS Nitro enclave" />
          <ProofRow label="floe_nav verifier" value={shortAddr(NAV.package)} href={suiObject(NAV.package)} sub="v3 · NAV + Vol + Collateral" />
          <ProofRow label="Enclave config" value={shortAddr(NAV.enclaveConfig)} href={suiObject(NAV.enclaveConfig)} sub="holds the registered PCR set" />
          <ProofRow label="PCR0 measurement" raw value={NAV.pcr0} sub="reproducible — identical on laptop + EC2" />
        </div>
      </section>

      {/* Chain of proof */}
      <section>
        <div className="vf-section-head">
          <h2 className="vf-h2">How a figure becomes provable</h2>
          <p>Four steps turn an off-chain computation into a number the contract will act on — or refuse to.</p>
        </div>
        <div className="vf-steps__grid">
          {STEPS.map((s) => (
            <div key={s.n} className="vf-step">
              <span className="vf-step__n">{s.n}</span>
              <s.Icon className="vf-step__icon" size={20} />
              <span className="vf-step__t">{s.t}</span>
              <span className="vf-step__d">{s.d}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Intent separation */}
      <section>
        <div className="vf-section-head">
          <h2 className="vf-h2">Intent separation</h2>
          <p>Every payload is tagged with a typed intent, so a signature minted for one value can never be replayed as another. Three are proven live on hardware; risk is reserved.</p>
        </div>
        <div className="vf-intent-grid">
          {INTENTS.map((i) => (
            <div key={i.id} className="vf-intent" data-reserved={i.ok ? undefined : "1"}>
              <div className="vf-intent__top">
                <span className="vf-intent__id">intent {i.id}</span>
                <span className={`vf-flag ${i.ok ? "is-ok" : "is-soon"}`}>{i.ok ? "proven" : "reserved"}</span>
              </div>
              <span className="vf-intent__name">{i.name}</span>
              <span className="vf-intent__d">{i.d}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Live attestation — every vault */}
      <div className="floe-panel">
        <div className="floe-panel__head">
          <div className="floe-panel__title">Live attestation — every vault</div>
          <div className="floe-panel__sub">{rows.length ? `${rows.length} live · testnet` : "testnet"} · click through to chain</div>
        </div>

        {isLoading && (
          <div style={{ padding: "var(--space-6)" }}>
            <div className="state-line"><span className="state-line__spinner" /> Reading attestation state from testnet…</div>
          </div>
        )}
        {error && (
          <div style={{ padding: "var(--space-6)" }}>
            <div className="state-line" style={{ color: "var(--stale)" }}>Could not read vaults — {(error as Error).message}</div>
          </div>
        )}

        {!isLoading && !error && rows.length > 0 && (
          <>
            <div className="earn-dir__scroll">
              <table className="earn-table">
                <thead>
                  <tr>
                    <th>Vault</th>
                    <th className="r">NAV</th>
                    <th className="r">Proven floor</th>
                    <th className="r">% certain</th>
                    <th className="r">Proof state</th>
                    <th className="r" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((v) => (
                    <tr key={v.vaultId} onClick={() => { window.location.href = `/earn/${v.vaultId}`; }}>
                      <td>
                        <div className="vf-vault__name">
                          {v.name}
                          {isOfficial(v.curator) && <OfficialBadge />}
                        </div>
                        <div className="earn-row__strategy">{v.strategyKind || "structured"} · {shortAddr(v.curator)}</div>
                      </td>
                      <td className="r"><div className="earn-row__num">{fmt6(v.nav)}</div></td>
                      <td className="r"><div className="earn-row__num earn-row__num--floor">{fmt6(v.navLowerBound)}</div></td>
                      <td className="r"><div className="earn-row__num">{v.pctCertain.toFixed(1)}%</div></td>
                      <td className="r">
                        <div style={{ display: "inline-flex" }}>
                          <ProofBadge label={v.navSafetyLabel as VaultSafety} fresh={v.navFresh} size="sm" />
                        </div>
                      </td>
                      <td className="r">
                        <a
                          className="vf-link"
                          href={suiObject(v.vaultId)}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          on-chain <ExternalLink size={13} />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {verified < rows.length && (
              <div className="vf-note">
                <ShieldAlert size={14} />
                <span>
                  Some floors currently read <strong>proven, re-attestation pending</strong> — the attestation keeper
                  is spun down between sessions to save cost. This is designed-safe behavior: floors stay enforced and
                  withdrawals are honored at the proven floor. A keeper run refreshes them to fresh.
                </span>
              </div>
            )}
          </>
        )}

        {!isLoading && !error && rows.length === 0 && (
          <div style={{ padding: "var(--space-8)", textAlign: "center", color: "var(--text-muted)" }}>
            No vaults are live on the registry yet.
          </div>
        )}
      </div>

      {/* Reusable primitive — three proven consumers */}
      <section>
        <div className="vf-section-head">
          <h2 className="vf-h2">One primitive, three proven consumers</h2>
          <p>The same Verifiable Valuation primitive secures three different values on-chain — the proof it is reusable infrastructure, peer to Walrus and Nautilus, not a one-off vault feature.</p>
        </div>
        <div className="vf-consumer-grid">
          {CONSUMERS.map((c) => (
            <a key={c.t} className="vf-consumer" href={c.href} target="_blank" rel="noreferrer">
              <span className="vf-consumer__icon"><c.Icon size={19} /></span>
              <span className="vf-consumer__t">{c.t}</span>
              <span className="vf-consumer__fn">{c.fn}</span>
              <span className="vf-consumer__d">{c.d}</span>
              {c.t === "Volatility index" && volBps > 0n && (
                <span className="vf-consumer__live" style={{
                  display: "inline-flex", alignItems: "center", gap: 6, margin: "2px 0 4px",
                  fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--accent)",
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%", background: "var(--accent)",
                    boxShadow: "0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent)",
                  }} />
                  {volPct(volBps)} live · BTC ATM IV{vol && !vol.fresh ? " · index re-attesting" : ""}
                </span>
              )}
              <span className="vf-consumer__link">View on-chain <ArrowUpRight size={13} /></span>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
