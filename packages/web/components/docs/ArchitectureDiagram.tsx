import { Cpu, Database, Lock, ShieldCheck } from "lucide-react";

/* The Floe system shape, as a living layered diagram.
   Actors → SDK → Vault core → (Venues · floe_nav · floe_lend), with the
   Nautilus enclave signing valuations up into floe_nav. Mirrors ARCHITECTURE.md §1. */
export function ArchitectureDiagram() {
  return (
    <div className="dx-arch">
      {/* actors */}
      <div className="dx-arch__actors">
        {["Depositor", "Curator", "Agent", "Developer"].map((a) => (
          <span className="dx-chip" key={a}>{a}</span>
        ))}
      </div>
      <span className="dx-rail"><i /></span>

      {/* sdk */}
      <div className="dx-arch__layer dx-arch__sdk">
        <code>@floe/sdk</code>
        <span>TypeScript surface · reads · transactions · deploy</span>
      </div>
      <span className="dx-rail"><i /></span>

      {/* core */}
      <div className="dx-arch__core">
        <div className="dx-arch__core-head">
          <div>
            <div className="dx-arch__core-title">floe core · <code>Vault&lt;Q,S&gt;</code></div>
            <div className="dx-arch__core-sub">custody · shares · NAV · policy &amp; fees · circuit breaker · async redeem · agent caps</div>
          </div>
          <div className="dx-arch__side">
            <span className="dx-chip dx-chip--sm"><Database size={11} /> Walrus · audit</span>
            <span className="dx-chip dx-chip--sm"><Lock size={11} /> Seal · privacy</span>
          </div>
        </div>
      </div>

      {/* branches */}
      <div className="dx-arch__forks"><i /><i /><i /></div>
      <div className="dx-arch__branches">
        <div className="dx-arch__branch">
          <div className="dx-arch__bt">VenueModule</div>
          <p>One uniform interface — NAV = idle + Σ value()</p>
          <div className="dx-arch__pills"><span>DeepBook Predict</span><span>Cetus CLMM</span></div>
        </div>
        <div className="dx-arch__branch dx-arch__branch--moat">
          <span className="dx-arch__moatbadge"><ShieldCheck size={12} /> the moat</span>
          <div className="dx-arch__bt">floe_nav</div>
          <p>Verifiable Valuation primitive — verifies a signature on-chain before accepting a figure</p>
        </div>
        <div className="dx-arch__branch">
          <div className="dx-arch__bt">floe_lend</div>
          <p>Attested-collateral money market — borrow against the proven floor</p>
        </div>
      </div>

      {/* enclave signs up into floe_nav */}
      <div className="dx-arch__signrail"><span className="dx-arch__signtag">signs NAV · Vol · Collateral · Risk ↑</span></div>
      <div className="dx-arch__enclave">
        <span className="dx-arch__encicon"><Cpu size={16} /></span>
        <div>
          <div className="dx-arch__bt">Nautilus enclave</div>
          <p>AWS Nitro TEE · reproducible PCR measurement · registered on-chain</p>
        </div>
      </div>
    </div>
  );
}
