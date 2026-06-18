import { ShieldCheck, Clock, ExternalLink } from "lucide-react";
import type { VaultState } from "@floe/sdk/browser";
import { FLOE_ADDRESSES } from "@floe/sdk/browser";

/** The proof feed — renders the vault's current attestation state as a verifiable record.
 *  This is the moat: every figure resolves to on-chain proof (enclave + PCR). */
export function AttestationFeed({ vault }: { vault: VaultState }) {
  const nav = FLOE_ADDRESSES.testnet.nav;
  const verified = vault.navSafetyLabel === "verified";
  const enclaveUrl = `https://suiscan.xyz/testnet/object/${nav.enclave}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="floe-feed">
        <div className="floe-feed__item">
          <div className="floe-feed__rail">
            <div className={`floe-feed__dot${verified ? "" : " floe-feed__dot--pending"}`} />
          </div>
          <div>
            <div className="floe-feed__title">
              NAV floor {verified ? "attested" : vault.attested ? "proof stale" : "unattested"}
            </div>
            <div className="floe-feed__meta">
              Signed inside a registered AWS Nitro enclave · verified on-chain by floe_nav
            </div>
            <div className="floe-feed__meta">
              PCR0 <span className="floe-feed__hash">{nav.pcr0.slice(0, 16)}…</span>
            </div>
          </div>
          <div className="floe-feed__time">{verified ? "fresh" : "—"}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <a href={enclaveUrl} target="_blank" rel="noreferrer" className="k-btn k-btn--secondary k-btn--sm">
          <ShieldCheck size={14} /> Enclave object <ExternalLink size={12} />
        </a>
        <a href={`https://suiscan.xyz/testnet/object/${nav.enclaveConfig}`} target="_blank" rel="noreferrer" className="k-btn k-btn--secondary k-btn--sm">
          <Clock size={14} /> Enclave config <ExternalLink size={12} />
        </a>
      </div>

      <p style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.55 }}>
        Floe doesn't ask you to trust a curator or an oracle. The vault's floor is signed by
        hardware whose measurement (PCR) is registered on-chain, and verified by the contract
        before any figure is accepted. Don't trust — verify.
      </p>
    </div>
  );
}
