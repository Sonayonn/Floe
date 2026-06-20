"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowRight, ShieldCheck, Cpu, PenLine, CheckCircle2, Ban,
  Layers, TrendingUp, BadgeCheck, Activity, ShieldAlert, Landmark,
  ExternalLink, Send,
} from "lucide-react";
import { Reveal } from "@/components/landing/Reveal";
import { LazyInView } from "@/components/landing/LazyInView";
import { LandingNav } from "@/components/landing/LandingNav";
import { Interactions } from "@/components/landing/Interactions";
import { LiveProof } from "@/components/landing/LiveProof";
import { VenueMark } from "@/components/ui/Logo";
import { FLOE_VENUES } from "@floe/sdk/browser";
import { useVol, volPct } from "@/lib/hooks/useVol";

const IceScene = dynamic(() => import("@/components/landing/IceScene"), {
  ssr: false,
  loading: () => <div className="ice-canvas ice-canvas--fallback" />,
});
const FloeField = dynamic(() => import("@/components/landing/FloeField"), { ssr: false });

const PIPELINE = [
  { icon: Cpu, t: "Compute", d: "The strategy runs and the multi-venue NAV is computed inside a Nautilus TEE — a sealed enclave, not a private server you have to trust." },
  { icon: PenLine, t: "Sign", d: "The enclave signs the figure with hardware whose exact code measurement (PCR0) is registered on-chain. The signature can't be forged off that code." },
  { icon: CheckCircle2, t: "Verify", d: "The Move contract verifies the signature and its intent on-chain before it accepts the number. No verification, no acceptance." },
  { icon: Ban, t: "Refuse", d: "If a figure can't be verified, the vault refuses it: deposits fail closed, withdrawals fall to the proven floor. You're never trapped, never overpaid." },
];

const SUITE = [
  { icon: Layers, name: "Floe Vaults", tag: "Provable NAV, not reported.", d: "The issuance + curation core. Tokenized composable shares, attested NAV, hybrid-instant withdrawal, role-based access." },
  { icon: TrendingUp, name: "Floe Stratos", tag: "Premium harvesting on DeepBook Predict.", d: "The flagship strategy: PLP base yield, a 1σ vertical-range ladder priced off the SVI surface, and a Margin delta hedge.", flag: true },
  { icon: BadgeCheck, name: "Floe Attest", tag: "Verifiable valuation as a service.", d: "The attestation primitive (floe_nav). Any vault or app can prove its NAV, volatility, collateral, or risk — a reusable Sui primitive." },
  { icon: Activity, name: "Floe Index", tag: "An attested volatility feed.", d: "A verifiable implied-vol number the ecosystem can compose against — signed in the enclave, checked on-chain." },
  { icon: ShieldAlert, name: "Floe Guard", tag: "Provable safety.", d: "Circuit breaker + guardian + attested risk: NAV that can't be inflated, halts that can't be faked, a posture you can verify." },
  { icon: Landmark, name: "Floe Lend", tag: "The market that removed the oracle.", d: "An attested-collateral money market — collateral is valued at the enclave-signed floor, so a borrower can't forge what their shares are worth." },
];

const MOAT = [
  { logo: "nautilus", t: "Nautilus", role: "Verifiable compute", tint: "#298dff",
    d: "Proves the multi-venue NAV came from authorized code — full AWS Nitro attestation, verified on-chain.",
    href: "https://github.com/MystenLabs/nautilus" },
  { logo: "walrus", t: "Walrus", role: "Verifiable storage", tint: "#34e6d6",
    d: "Every rebalance and NAV snapshot written as a tamper-evident blob, indexed on-chain. Auditable history.",
    href: "https://www.walrus.xyz" },
  { logo: "seal", t: "Seal", role: "Private alpha", tint: "#cdf24a",
    d: "Curator strategy parameters stay encrypted — decryptable only inside their enclave. Private alpha and provable execution at once.",
    href: "https://github.com/MystenLabs/seal" },
] as const;

export default function Landing() {
  const { data: vol } = useVol();
  const volBps = vol ? (vol.liveBps > 0n ? vol.liveBps : vol.indexBps) : 0n;
  return (
    <main className="lp">
      <Interactions />
      <LandingNav />

      {/* ── HERO ───────────────────────────────────────────────── */}
      <section className="lp-hero">
        <div className="lp-hero__stage" aria-hidden>
          <IceScene />
          <div className="lp-hero__vignette" />
        </div>

        <div className="lp-hero__content">
          <div className="lp-eyebrow">Verifiable asset management · on Sui</div>
          <h1 className="lp-hero__title">
            Most vaults ask you to <span className="lp-strike">trust</span> their numbers.{" "}
            <span className="lp-accent">Floe proves them.</span>
          </h1>
          <p className="lp-hero__sub">
            Curator-run vaults that allocate across every Sui yield venue and prove their redeemable floor with
            hardware attestation — not a self-reported oracle. Every figure is verifiable on-chain.
          </p>
          <div className="lp-hero__cta">
            <Link href="/earn" className="k-btn k-btn--primary k-btn--lg">Enter the app <ArrowRight size={17} /></Link>
            <Link href="/verify" className="k-btn k-btn--secondary k-btn--lg"><ShieldCheck size={16} /> See the proof</Link>
          </div>
        </div>

        <a href="#inversion" className="lp-scrollcue" aria-label="Scroll down"><span /></a>
      </section>

      {/* ── TRUST INVERSION ────────────────────────────────────── */}
      <section className="lp-section" id="inversion">
        <Reveal className="lp-head" as="header">
          <div className="lp-eyebrow lp-eyebrow--center">The trust inversion</div>
          <h2 className="lp-h2">Everyone else reports. <span className="lp-accent">Floe proves — or refuses.</span></h2>
          <p className="lp-lead">
            The whole category mints and redeems against a NAV someone <em>asserts</em>. That single assumption is
            behind the largest losses in onchain asset management. Floe removes it.
          </p>
        </Reveal>

        <div className="lp-compare">
          <Reveal className="lp-compare__col lp-compare__col--report">
            <div className="lp-compare__tag">The category</div>
            <h3>Reported NAV</h3>
            <ul className="lp-clist">
              <li>Strategy runs on a private server</li>
              <li>Results are posted on-chain</li>
              <li>You trust the number is real</li>
              <li>Oracle/NAV manipulation is the #1 failure mode</li>
            </ul>
            <div className="lp-compare__foot">$8.8B lost to asserted-NAV failures in 2025 alone.</div>
          </Reveal>

          <div className="lp-compare__vs" aria-hidden><span>vs</span></div>

          <Reveal className="lp-compare__col lp-compare__col--prove" delay={120}>
            <div className="lp-compare__tag lp-compare__tag--accent">Floe</div>
            <h3>Proven floor</h3>
            <ul className="lp-clist lp-clist--accent">
              <li>NAV computed inside a hardware enclave</li>
              <li>Signed by code measured on-chain</li>
              <li>Verified by the contract before it's accepted</li>
              <li>Refused if it can't be proven — you exit at the floor</li>
            </ul>
            <div className="lp-compare__foot lp-compare__foot--accent">
              <code>nav_lower_bound</code> — the redeemable floor a curator can never inflate.
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── PIPELINE ───────────────────────────────────────────── */}
      <section className="lp-section lp-section--tint" id="how">
        <Reveal className="lp-head" as="header">
          <div className="lp-eyebrow lp-eyebrow--center">How a number becomes provable</div>
          <h2 className="lp-h2">Four steps from a figure to a fact.</h2>
          <p className="lp-lead">Every NAV update — across every venue a vault touches — runs this path before the chain will act on it.</p>
        </Reveal>

        <div className="lp-pipe">
          {PIPELINE.map((s, i) => {
            const Icon = s.icon;
            return (
              <Reveal className="lp-step" key={s.t} delay={i * 110} data-spotlight>
                <div className="lp-step__rail"><span className="lp-step__num">{String(i + 1).padStart(2, "0")}</span></div>
                <div className="lp-step__icon"><Icon size={22} /></div>
                <h3 className="lp-step__t">{s.t}</h3>
                <p className="lp-step__d">{s.d}</p>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* ── SUITE ──────────────────────────────────────────────── */}
      <section className="lp-section" id="suite">
        <Reveal className="lp-head" as="header">
          <div className="lp-eyebrow lp-eyebrow--center">One primitive, a whole suite</div>
          <h2 className="lp-h2">Verifiable valuation, composed into products.</h2>
          <p className="lp-lead">Register an enclave once; attest any typed value; verify it on-chain. Everything Floe ships is a consumer of that one primitive.</p>
        </Reveal>

        <div className="lp-suite">
          {SUITE.map((p, i) => {
            const Icon = p.icon;
            return (
              <Reveal className={`lp-card${p.flag ? " lp-card--flag" : ""}`} key={p.name} delay={(i % 3) * 90} data-spotlight>
                {p.flag && <span className="lp-card__flag">Flagship</span>}
                <div className="lp-card__icon"><Icon size={20} /></div>
                <h3 className="lp-card__name">{p.name}</h3>
                <div className="lp-card__tag">{p.tag}</div>
                <p className="lp-card__d">{p.d}</p>
                {p.name === "Floe Index" && volBps > 0n && (
                  <div style={{
                    display: "inline-flex", alignItems: "center", gap: 7, marginTop: "auto",
                    paddingTop: 12, fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--accent)",
                  }}>
                    <span style={{
                      width: 6, height: 6, borderRadius: "50%", background: "var(--accent)",
                      boxShadow: "0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent)",
                    }} />
                    {volPct(volBps)} <span style={{ color: "var(--text-muted)" }}>live · BTC ATM IV, on-chain</span>
                  </div>
                )}
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* ── MULTI-VENUE ────────────────────────────────────────── */}
      <section className="lp-section lp-section--tint">
        <div className="lp-venue">
          <Reveal className="lp-venue__copy">
            <div className="lp-eyebrow">Resilience by composition</div>
            <h2 className="lp-h2">One vault spans every venue — so no single one can sink it.</h2>
            <p className="lp-lead lp-lead--left">
              A product that's a skin over one protocol dies when that protocol does. Floe allocates across venues
              through a uniform interface. If one pauses, the vault still holds its other positions and its idle
              reserve — and still redeems at the proven floor.
            </p>
            <Link href="/earn" className="k-btn k-btn--secondary">Explore the vaults <ArrowRight size={15} /></Link>
          </Reveal>

          <Reveal className="lp-venue__list" delay={120}>
            {FLOE_VENUES.map((v) => (
              <div className="lp-venue__row" key={v.key}>
                <VenueMark venueKey={v.key} size={34} live={v.status === "live"} title={v.name} />
                <div className="lp-venue__meta">
                  <span className="lp-venue__name">{v.name}</span>
                  <span className="lp-venue__cat">{v.category}</span>
                </div>
                <span className={`lp-venue__status lp-venue__status--${v.status === "live" ? "live" : "soon"}`}>
                  {v.status === "live" ? "Live" : "Mainnet"}
                </span>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ── LIVE PROOF ─────────────────────────────────────────── */}
      <section className="lp-section" id="proof">
        <Reveal className="lp-head" as="header">
          <div className="lp-eyebrow lp-eyebrow--center">Not a mockup</div>
          <h2 className="lp-h2">These figures are live on Sui testnet, right now.</h2>
          <p className="lp-lead">The same state the app reads. Click any number to open its object on the explorer.</p>
        </Reveal>
        <Reveal><LiveProof /></Reveal>
      </section>

      {/* ── MOAT ───────────────────────────────────────────────── */}
      <section className="lp-section lp-section--tint">
        <Reveal className="lp-head" as="header">
          <div className="lp-eyebrow lp-eyebrow--center">The uncopyable part</div>
          <h2 className="lp-h2">Three Sui primitives, composed into one thing only Sui can do.</h2>
          <p className="lp-lead">Private alpha and provable execution at the same time, across multiple venues — structurally impossible on EVM or Solana.</p>
        </Reveal>
        <div className="lp-moat">
          {MOAT.map((m, i) => (
            <Reveal className="lp-moat__card" key={m.t} delay={i * 110}>
              <a
                className="lp-moat__link" href={m.href} target="_blank" rel="noreferrer"
                data-spotlight style={{ ["--tint" as string]: m.tint }}
              >
                <div className="lp-moat__plate">
                  <img className="lp-moat__logo" src={`/logos/${m.logo}.${m.logo === "seal" ? "png" : "svg"}`} alt={`${m.t} logo`} loading="lazy" />
                </div>
                <div className="lp-moat__role">{m.role}</div>
                <h3 className="lp-moat__t">{m.t} <ExternalLink size={13} /></h3>
                <p className="lp-moat__d">{m.d}</p>
              </a>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── FINAL CTA ──────────────────────────────────────────── */}
      <section className="lp-cta">
        <div className="lp-cta__stage" aria-hidden>
          <LazyInView><FloeField /></LazyInView>
          <div className="lp-cta__veil" />
        </div>
        <Reveal className="lp-cta__inner">
          <h2 className="lp-cta__title">Don't trust. <span className="lp-accent">Verify.</span></h2>
          <p className="lp-cta__sub">Open a vault, deposit, and watch the proven floor update on-chain. Or read how the attestation works end to end.</p>
          <div className="lp-cta__btns">
            <Link href="/earn" className="k-btn k-btn--primary k-btn--lg">Enter the app <ArrowRight size={17} /></Link>
            <Link href="/verify" className="k-btn k-btn--secondary k-btn--lg"><ShieldCheck size={16} /> See the proof</Link>
          </div>
        </Reveal>

        <footer className="lp-footer">
          <span>Floe — verifiable asset management on Sui.</span>
          <span className="lp-footer__chips">
            <span className="lp-footer__chip"><VenueMark venueKey="sui" size={16} /> Built on Sui</span>
            <span className="lp-footer__chip"><VenueMark venueKey="deepbook" size={16} /> Powered by DeepBook</span>
            <Link className="lp-footer__chip lp-footer__link" href="/docs">Docs</Link>
            <a className="lp-footer__chip lp-footer__link" href="https://t.me/+DQEQCqMcq5phNWE0" target="_blank" rel="noreferrer"><Send size={13} /> Community</a>
            <a className="lp-footer__chip lp-footer__link" href="https://suiscan.xyz/testnet" target="_blank" rel="noreferrer">Testnet <ExternalLink size={12} /></a>
          </span>
        </footer>
      </section>
    </main>
  );
}
