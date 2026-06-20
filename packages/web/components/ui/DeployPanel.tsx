"use client";
import { useState } from "react";
import { useCurrentAccount, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { useQueryClient } from "@tanstack/react-query";
import { buildDeployPlpTx, assetFor, type VaultState } from "@floe/sdk/browser";
import { Sparkles } from "lucide-react";
import { useExecCap } from "@/lib/hooks/useExecCap";
import { fmt6 } from "@/lib/format";

/**
 * Curator-only "Deploy idle → PLP" action. Renders ONLY for the wallet that holds
 * the vault's ExecCap (its operator). This is the honest answer to "my new vault is
 * all idle": deployment is an explicit, owner-signed action — the contract never
 * moves funds into a venue on its own. PLP base yield is oracle-independent, so this
 * works even while the SVI oracle is between markets.
 */
export function DeployPanel({ vault, qType, sType }: { vault: VaultState; qType: string; sType: string }) {
  const account = useCurrentAccount();
  const qc = useQueryClient();
  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction();
  const { data: execCapId } = useExecCap(vault.vaultId, account?.address);

  const meta = assetFor(qType);
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<{ kind: "idle" | "ok" | "err"; msg?: string; digest?: string }>({ kind: "idle" });

  // Only the operator (ExecCap holder) sees this, and only when there's idle to deploy.
  if (!account || !execCapId || vault.idle === 0n) return null;

  const amountRaw = (() => {
    const n = parseFloat(amount);
    if (!isFinite(n) || n <= 0) return 0n;
    return BigInt(Math.floor(n * 10 ** meta.decimals));
  })();
  const tooMuch = amountRaw > vault.idle;
  const canSubmit = amountRaw > 0n && !tooMuch && !isPending;

  function submit() {
    if (!account || !execCapId) return;
    setStatus({ kind: "idle" });
    const tx = buildDeployPlpTx({
      vaultId: vault.vaultId, qType, sType, sender: account.address, execCapId, amount: amountRaw,
    });
    signAndExecute({ transaction: tx }, {
      onSuccess: (res) => {
        setStatus({ kind: "ok", digest: res.digest });
        setAmount("");
        qc.invalidateQueries({ queryKey: ["vault", vault.vaultId] });
        qc.invalidateQueries({ queryKey: ["vaults"] });
      },
      onError: (e) => setStatus({ kind: "err", msg: (e as Error).message }),
    });
  }

  return (
    <div className="floe-panel" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <Sparkles size={14} style={{ color: "var(--accent)" }} />
        <span className="floe-eyebrow">Operator · Deploy idle → PLP</span>
      </div>
      <p style={{ fontSize: 11.5, color: "var(--text-subtle)", lineHeight: 1.5, margin: 0 }}>
        You hold this vault’s ExecCap. Put idle reserve to work as DeepBook Predict liquidity (base yield) — an explicit, signed action; the vault never deploys on its own.
      </p>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-subtle)" }}>idle available</span>
        <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>{fmt6(vault.idle)} {meta.symbol}</span>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", background: "var(--surface-raised)", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)", padding: "10px 12px" }}>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="0.00"
          inputMode="decimal"
          style={{ flex: 1, background: "none", border: "none", outline: "none", color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: 18, minWidth: 0 }}
        />
        <button className="k-btn k-btn--ghost k-btn--sm" onClick={() => setAmount((Number(vault.idle) / 10 ** meta.decimals).toString())}>MAX</button>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-muted)" }}>{meta.symbol}</span>
      </div>

      <button className="k-btn k-btn--primary" style={{ width: "100%", justifyContent: "center", opacity: canSubmit ? 1 : 0.5, cursor: canSubmit ? "pointer" : "not-allowed" }} disabled={!canSubmit} onClick={submit}>
        {isPending ? "Confirming…" : tooMuch ? "Exceeds idle" : "Deploy to PLP"}
      </button>

      {status.kind === "ok" && (
        <a href={`https://suiscan.xyz/testnet/tx/${status.digest}`} target="_blank" rel="noreferrer" className="k-tag k-tag--positive" style={{ justifyContent: "center" }}>
          Deployed · view on explorer
        </a>
      )}
      {status.kind === "err" && <div className="k-tag k-tag--caution" style={{ whiteSpace: "normal", height: "auto", padding: "6px 9px" }}>{status.msg?.slice(0, 140)}</div>}
    </div>
  );
}
