"use client";
import { useMemo, useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";
import {
  Boxes, Layers, TrendingUp, Activity, Coins, ShieldCheck, Gauge, Workflow,
  PenLine, Cpu, CheckCircle2, ArrowRight, ArrowLeft, Info, Sparkles,
} from "lucide-react";
import { FLOE_ADDRESSES, FLOE_VENUES, FLOE_ASSETS, assetFor } from "@floe/sdk/browser";
import { CodeBlock } from "@/components/docs/CodeBlock";
import { VenueMark } from "@/components/ui/Logo";
import { shortAddr } from "@/lib/format";

const A = FLOE_ADDRESSES.testnet;

/* Stratum bit flags + fee caps mirror the on-chain contract (config/policy.ts, config/fees.ts). */
const Stratum = { PLP: 1, RANGE: 2, HEDGE: 4 } as const;
const MAX_MGMT_BPS = 300;   // 3 %
const MAX_PERF_BPS = 2000;  // 20 %

const DUSDC = "0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC";

const STRATA = [
  { bit: Stratum.PLP, icon: Coins, t: "PLP base yield", d: "DeepBook Predict liquidity-provider yield — the floor-eligible base layer.", required: true },
  { bit: Stratum.RANGE, icon: TrendingUp, t: "Vertical range ladder", d: "A 1σ range ladder priced off the SVI surface — the premium-harvesting alpha." },
  { bit: Stratum.HEDGE, icon: Activity, t: "Delta hedge", d: "A Margin delta hedge that neutralises directional drift on the range book." },
];

const STEPS = ["Strategy", "Venues & strata", "Risk policy", "Fees", "Review"];

const PIPELINE = [
  { icon: PenLine, t: "Publish share coin", d: "A per-vault SHARE coin is published via coin_registry (Sui CLI / Node)." },
  { icon: Cpu, t: "Provision managers", d: "A PredictManager + BalanceManager are created for the vault's venues." },
  { icon: Boxes, t: "deploy_vault", d: "The vault is deployed with your encoded policy + fees and listed in the registry." },
];

export default function DeployPage() {
  const account = useCurrentAccount();
  const [step, setStep] = useState(0);
  const [deployed, setDeployed] = useState(false);

  // strategy
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [asset] = useState(DUSDC);
  // venues & strata
  const [venues, setVenues] = useState<string[]>(["deepbook", "idle"]);
  const [strata, setStrata] = useState<number>(Stratum.PLP);
  const [plpFloorBps, setPlpFloorBps] = useState(5000);
  // risk
  const [maxPositionSize, setMaxPositionSize] = useState("1000");
  const [maxTotalExposure, setMaxTotalExposure] = useState("10000");
  const [maxLeverageBps, setMaxLeverageBps] = useState(30000);
  // fees
  const [mgmtBps, setMgmtBps] = useState(100);
  const [perfBps, setPerfBps] = useState(1500);

  const qMeta = assetFor(asset);
  const recipient = account?.address ?? "<your address>";

  const posN = parseFloat(maxPositionSize) || 0;
  const expN = parseFloat(maxTotalExposure) || 0;

  // ── per-step validity ───────────────────────────────────────────────
  const symbolOk = /^[A-Z0-9]{2,6}$/.test(symbol);
  const valid = [
    name.trim().length >= 2 && symbolOk,
    venues.includes("deepbook") && (strata & Stratum.PLP) !== 0,
    posN > 0 && expN >= posN && maxLeverageBps >= 10000,
    mgmtBps <= MAX_MGMT_BPS && perfBps <= MAX_PERF_BPS,
    true,
  ];
  const allValid = valid.slice(0, 4).every(Boolean);

  const toggleVenue = (k: string) => {
    if (k === "idle") return;                       // idle reserve always on
    const v = FLOE_VENUES.find((x) => x.key === k);
    if (v?.status === "mainnet") return;            // mainnet-only venues disabled
    setVenues((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
  };
  const toggleStratum = (bit: number) => {
    if (bit === Stratum.PLP) return;                // PLP is the required base
    setStrata((s) => (s & bit ? s & ~bit : s | bit));
  };

  const strataExpr =
    [
      strata & Stratum.PLP ? "Policy.Stratum.PLP" : "",
      strata & Stratum.RANGE ? "Policy.Stratum.RANGE" : "",
      strata & Stratum.HEDGE ? "Policy.Stratum.HEDGE" : "",
    ].filter(Boolean).join(" | ") || "0";

  const config = `import { FloeClient, FloeVault, Policy } from "@floe/sdk";

const floe = new FloeClient({ network: "testnet", signer });

const vault = await FloeVault.deploy(floe, {
  asset:  "${asset}",
  name:   "${name || "My Vault"}",
  symbol: "${symbol || "MYV"}",
  policy: {
    allowedOracles:   ["${A.predict.btcOracle}"],
    maxPositionSize:  ${big(posN)},
    maxTotalExposure: ${big(expN)},
    maxLeverageBps:   ${maxLeverageBps},
    enabledStrata:    ${strataExpr},
    plpFloorBps:      ${plpFloorBps},
  },
  fees: { managementBps: ${mgmtBps}, performanceBps: ${perfBps} },
  predictPackageId: "${A.predict.package}",
});
// → { vaultId, shareType, ownerCapId, curatorCapId, … }`;

  return (
    <div className="dep">
      <div className="page-head">
        <div>
          <div className="floe-eyebrow">Curator · Deploy a vault</div>
          <h1 className="page-head__title">Deploy a vault</h1>
          <p className="page-head__sub">
            Launch your own Floe vault in a few steps. It allocates across Sui yield venues through one uniform
            interface, lists in the directory under your name, and <strong>inherits provable, enclave-attested NAV by
            default</strong> — no contracts to write.
          </p>
        </div>
        <div className="kpi-strip">
          <div className="kpi"><span className="kpi__k">Fee caps</span><span className="kpi__v">3% / 20%</span></div>
          <div className="kpi"><span className="kpi__k">Proven NAV</span><span className="kpi__v kpi__v--accent">default</span></div>
        </div>
      </div>

      <div className="dep-grid">
        {/* ── wizard ─────────────────────────────────────────── */}
        <div className="dep-main floe-panel">
          <ol className="dep-steps">
            {STEPS.map((s, i) => (
              <li key={s} className={`dep-step${i === step ? " is-current" : ""}${i < step ? " is-done" : ""}`}>
                <button onClick={() => i < step && setStep(i)} disabled={i > step}>
                  <span className="dep-step__n">{i < step ? <CheckCircle2 size={14} /> : i + 1}</span>
                  <span className="dep-step__l">{s}</span>
                </button>
              </li>
            ))}
          </ol>

          <div className="dep-body">
            {/* STEP 0 — strategy */}
            {step === 0 && (
              <div className="dep-fields">
                <Head icon={Sparkles} t="Strategy & identity" d="Name your vault and its share token. Stratos is the flagship premium-harvesting strategy." />
                <Field label="Vault name" hint="Shown in the Earn directory">
                  <input className="dep-input" value={name} maxLength={40}
                    onChange={(e) => setName(e.target.value)} placeholder="e.g. Stratos Prime" />
                </Field>
                <Field label="Share symbol" hint="2–6 chars · A–Z, 0–9" error={symbol.length > 0 && !symbolOk ? "Use 2–6 uppercase letters/digits" : undefined}>
                  <input className="dep-input" value={symbol} maxLength={6}
                    onChange={(e) => setSymbol(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} placeholder="MYV" />
                </Field>
                <Field label="Quote asset" hint="What depositors bring & the vault values in">
                  <div className="dep-asset">
                    <VenueMark venueKey="usdc" size={22} />
                    <div><span className="dep-asset__sym">{qMeta.symbol}</span><span className="dep-asset__name">{qMeta.name}</span></div>
                    <span className="dep-chip" style={{ marginLeft: "auto" }}>6 dp</span>
                  </div>
                </Field>
              </div>
            )}

            {/* STEP 1 — venues & strata */}
            {step === 1 && (
              <div className="dep-fields">
                <Head icon={Layers} t="Venues" d="Where the vault may allocate. The idle reserve is always available; mainnet-only venues activate later." />
                <div className="dep-venues">
                  {FLOE_VENUES.map((v) => {
                    const on = venues.includes(v.key);
                    const locked = v.key === "idle" || v.status === "mainnet";
                    return (
                      <button key={v.key} className={`dep-venue${on ? " is-on" : ""}${locked ? " is-locked" : ""}`}
                        onClick={() => toggleVenue(v.key)} disabled={locked && v.status === "mainnet"}>
                        <VenueMark venueKey={v.key} size={26} live={v.status === "live"} />
                        <div className="dep-venue__meta">
                          <span className="dep-venue__name">{v.name}</span>
                          <span className="dep-venue__cat">{v.category}</span>
                        </div>
                        <span className={`dep-venue__status dep-venue__status--${v.status === "live" ? "live" : "soon"}`}>
                          {v.key === "idle" ? "always" : v.status === "live" ? (on ? "on" : "off") : "mainnet"}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <Head icon={Workflow} t="Strata" d="Which strategy layers the vault may run. PLP is the floor-eligible base; range + hedge add the alpha." />
                <div className="dep-strata">
                  {STRATA.map((s) => {
                    const on = (strata & s.bit) !== 0;
                    const Icon = s.icon;
                    return (
                      <button key={s.bit} className={`dep-toggle${on ? " is-on" : ""}${s.required ? " is-locked" : ""}`}
                        onClick={() => toggleStratum(s.bit)}>
                        <span className="dep-toggle__icon"><Icon size={16} /></span>
                        <div className="dep-toggle__meta">
                          <span className="dep-toggle__t">{s.t}{s.required && <em> · base</em>}</span>
                          <span className="dep-toggle__d">{s.d}</span>
                        </div>
                        <span className="dep-switch" data-on={on ? "1" : undefined} />
                      </button>
                    );
                  })}
                </div>
                <Slider label="PLP floor" hint="Min share of capital kept in floor-eligible PLP"
                  value={plpFloorBps} min={0} max={10000} step={500} fmt={(v) => `${(v / 100).toFixed(0)}%`} onChange={setPlpFloorBps} />
              </div>
            )}

            {/* STEP 2 — risk policy */}
            {step === 2 && (
              <div className="dep-fields">
                <Head icon={Gauge} t="Risk policy" d="On-chain guardrails the contract enforces on every allocation — not suggestions." />
                <Field label={`Max position size (${qMeta.symbol})`} hint="Largest single venue position">
                  <NumInput value={maxPositionSize} onChange={setMaxPositionSize} suffix={qMeta.symbol} />
                </Field>
                <Field label={`Max total exposure (${qMeta.symbol})`} hint="Cap across all venues"
                  error={expN > 0 && expN < posN ? "Must be ≥ max position size" : undefined}>
                  <NumInput value={maxTotalExposure} onChange={setMaxTotalExposure} suffix={qMeta.symbol} />
                </Field>
                <Slider label="Max leverage" hint="Caps borrow-amplified exposure"
                  value={maxLeverageBps} min={10000} max={30000} step={5000} fmt={(v) => `${(v / 10000).toFixed(1)}×`} onChange={setMaxLeverageBps} />
                <div className="dep-note"><Info size={14} /> Allowed oracle defaults to the DeepBook Predict BTC SVI oracle — the source the vol index and range pricing read.</div>
              </div>
            )}

            {/* STEP 3 — fees */}
            {step === 3 && (
              <div className="dep-fields">
                <Head icon={Coins} t="Fees" d="Capped on-chain — the contract rejects anything above 3% management or 20% performance." />
                <Slider label="Management fee" hint={`Annualised · cap ${MAX_MGMT_BPS / 100}%`}
                  value={mgmtBps} min={0} max={MAX_MGMT_BPS} step={25} fmt={(v) => `${(v / 100).toFixed(2)}%`} onChange={setMgmtBps} />
                <Slider label="Performance fee" hint={`On profit above high-water mark · cap ${MAX_PERF_BPS / 100}%`}
                  value={perfBps} min={0} max={MAX_PERF_BPS} step={100} fmt={(v) => `${(v / 100).toFixed(0)}%`} onChange={setPerfBps} />
                <Field label="Fee recipient" hint="Defaults to your connected wallet">
                  <div className="dep-recipient">{account ? shortAddr(account.address) : "Connect a wallet to set"}</div>
                </Field>
              </div>
            )}

            {/* STEP 4 — review */}
            {step === 4 && !deployed && (
              <div className="dep-fields">
                <Head icon={ShieldCheck} t="Review & deploy" d="This is the exact configuration that will be encoded on-chain. Caps are enforced by the contract." />
                <CodeBlock lang="ts" filename="deploy.ts" code={config} />
                {!account && <div className="dep-note dep-note--warn"><Info size={14} /> Connect your wallet to deploy — you'll be the vault owner & curator.</div>}
              </div>
            )}

            {/* deployed — pipeline result */}
            {step === 4 && deployed && (
              <div className="dep-fields">
                <Head icon={Boxes} t="Deployment pipeline" d="Vault creation runs a 3-transaction curator pipeline. Your configuration is ready." />
                <div className="dep-pipeline">
                  {PIPELINE.map((p, i) => {
                    const Icon = p.icon;
                    return (
                      <div className="dep-pl" key={p.t}>
                        <span className="dep-pl__icon"><Icon size={16} /></span>
                        <div className="dep-pl__meta"><span className="dep-pl__t">{i + 1}. {p.t}</span><span className="dep-pl__d">{p.d}</span></div>
                      </div>
                    );
                  })}
                </div>
                <div className="dep-note"><Info size={14} />
                  The per-vault SHARE coin is published through the Sui CLI (a server step), so the pipeline runs with a
                  signer rather than in the browser. Run the two commands below: the first deploys your vault with the exact
                  config above; the second <strong>activates it to yield</strong> so it earns from day one instead of sitting idle.
                </div>
                <CodeBlock lang="bash" filename="1 · deploy your vault" code={`SUI_PRIVATE_KEY=<your key> \\\nPREDICT_PACKAGE_ID=${A.predict.package} \\\npnpm exec tsx examples/deploy-vault.ts\n# → prints { vaultId, execCapId, shareType, … }`} />
                <CodeBlock lang="bash" filename="2 · activate to yield (deploy PLP)" code={`VAULT_ID=<vaultId> EXEC_CAP=<execCapId> AMOUNT=<dUSDC raw> \\\npnpm exec tsx packages/sdk/scripts/deploy-plp.ts\n# moves idle reserve into DeepBook Predict PLP — the vault now earns base yield`} />
                <div className="dep-note"><Info size={14} />
                  One-click in-app deploy runs the same pipeline on Floe&rsquo;s hosted deploy service (Sui CLI + funded
                  gas), with you set as owner &amp; curator — it activates when the service endpoint is configured.
                </div>
                <button className="k-btn k-btn--secondary" onClick={() => setDeployed(false)}>← Back to review</button>
              </div>
            )}
          </div>

          {/* nav */}
          {!(step === 4 && deployed) && (
            <div className="dep-nav">
              <button className="k-btn k-btn--ghost" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
                <ArrowLeft size={15} /> Back
              </button>
              {step < 4 ? (
                <button className="k-btn k-btn--primary" disabled={!valid[step]} onClick={() => setStep((s) => s + 1)}>
                  Continue <ArrowRight size={15} />
                </button>
              ) : (
                <button className="k-btn k-btn--primary" disabled={!allValid || !account}
                  onClick={() => setDeployed(true)}>
                  <Boxes size={15} /> {account ? "Deploy vault" : "Connect wallet to deploy"}
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── live preview + pipeline ────────────────────────── */}
        <aside className="dep-aside">
          <div className="floe-panel dep-preview">
            <div className="dep-preview__label">Directory preview</div>
            <div className="dep-pcard">
              <div className="dep-pcard__top">
                <span className="dep-pcard__mark"><VenueMark venueKey="usdc" size={20} /></span>
                <div>
                  <div className="dep-pcard__name">{name || "My Vault"}</div>
                  <div className="dep-pcard__sym">{symbol || "MYV"} · {qMeta.symbol}</div>
                </div>
                <span className="k-tag k-tag--positive" style={{ marginLeft: "auto" }}>Proven NAV</span>
              </div>
              <div className="dep-pcard__venues">
                {venues.map((k) => <VenueMark key={k} venueKey={k} size={20} title={FLOE_VENUES.find((v) => v.key === k)?.name} />)}
              </div>
              <div className="dep-pcard__row"><span>Strata</span><span>{strataNames(strata)}</span></div>
              <div className="dep-pcard__row"><span>Max leverage</span><span>{(maxLeverageBps / 10000).toFixed(1)}×</span></div>
              <div className="dep-pcard__row"><span>PLP floor</span><span>{(plpFloorBps / 100).toFixed(0)}%</span></div>
              <div className="dep-pcard__row"><span>Fees</span><span>{(mgmtBps / 100).toFixed(2)}% · {(perfBps / 100).toFixed(0)}%</span></div>
              <div className="dep-pcard__row"><span>Curator</span><span>{account ? shortAddr(account.address) : "—"}</span></div>
            </div>
          </div>

          <div className="floe-panel dep-how">
            <div className="dep-how__head"><Boxes size={15} /> How deployment works</div>
            {PIPELINE.map((p, i) => {
              const Icon = p.icon;
              return (
                <div className="dep-how__step" key={p.t}>
                  <span className="dep-how__n"><Icon size={13} /></span>
                  <div><span className="dep-how__t">{p.t}</span><span className="dep-how__d">{p.d}</span></div>
                </div>
              );
            })}
            <div className="dep-how__foot">Your vault inherits the Nautilus attestation moat — provable NAV — with zero extra work.</div>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ── helpers ─────────────────────────────────────────────────────────────────
function big(humanQuote: number): string {
  const raw = BigInt(Math.floor(humanQuote * 1e6));
  return raw.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "_") + "n";
}
function strataNames(s: number): string {
  return [s & Stratum.PLP && "PLP", s & Stratum.RANGE && "Range", s & Stratum.HEDGE && "Hedge"].filter(Boolean).join(" + ") || "—";
}

function Head({ icon: Icon, t, d }: { icon: any; t: string; d: string }) {
  return (
    <div className="dep-head">
      <span className="dep-head__icon"><Icon size={16} /></span>
      <div><h3>{t}</h3><p>{d}</p></div>
    </div>
  );
}
function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="dep-field">
      <div className="dep-field__head"><span className="floe-eyebrow">{label}</span>{hint && <span className="dep-field__hint">{hint}</span>}</div>
      {children}
      {error && <span className="dep-field__err">{error}</span>}
    </label>
  );
}
function NumInput({ value, onChange, suffix }: { value: string; onChange: (v: string) => void; suffix: string }) {
  return (
    <div className="dep-numinput">
      <input value={value} inputMode="decimal" placeholder="0"
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))} />
      <span>{suffix}</span>
    </div>
  );
}
function Slider({ label, hint, value, min, max, step, fmt, onChange }: {
  label: string; hint?: string; value: number; min: number; max: number; step: number; fmt: (v: number) => string; onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="dep-field">
      <div className="dep-field__head"><span className="floe-eyebrow">{label}</span><span className="dep-slider__val">{fmt(value)}</span></div>
      <input className="dep-slider" type="range" min={min} max={max} step={step} value={value}
        style={{ ["--pct" as string]: `${pct}%` }} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <span className="dep-field__hint">{hint}</span>}
    </div>
  );
}
