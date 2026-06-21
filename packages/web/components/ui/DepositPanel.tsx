"use client";
import { useState } from "react";
import { useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import { useQueryClient } from "@tanstack/react-query";
import { buildDepositTx, buildWithdrawTx, assetFor, type VaultState } from "@floe/sdk/browser";
import { Droplets } from "lucide-react";
import { useCoins } from "@/lib/hooks/useCoins";
import { useFloeExecute } from "@/lib/hooks/useFloeExecute";
import { fmt6 } from "@/lib/format";

type Mode = "deposit" | "withdraw";

export function DepositPanel({ vault, qType, sType }: { vault: VaultState; qType: string; sType: string }) {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const qc = useQueryClient();
  const execute = useFloeExecute();

  const [mode, setMode] = useState<Mode>("deposit");
  const [amount, setAmount] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [status, setStatus] = useState<{ kind: "idle" | "ok" | "err"; msg?: string; digest?: string }>({ kind: "idle" });

  const qMeta = assetFor(qType);
  const sMeta = assetFor(sType);
  const isDeposit = mode === "deposit";
  const coinType = isDeposit ? qType : sType;
  const meta = isDeposit ? qMeta : sMeta;
  const { coins, total } = useCoins(account?.address, coinType);

  const amountRaw = (() => {
    const n = parseFloat(amount);
    if (!isFinite(n) || n <= 0) return 0n;
    return BigInt(Math.floor(n * 10 ** meta.decimals));
  })();

  const insufficient = amountRaw > total;
  const frozen = isDeposit && vault.depositsFrozen;
  const canSubmit = !!account && amountRaw > 0n && !insufficient && !frozen && !isPending && coins.length > 0;

  async function submit() {
    if (!account || coins.length === 0) return;
    setStatus({ kind: "idle" });
    setIsPending(true);
    const tx = isDeposit
      ? buildDepositTx({ vaultId: vault.vaultId, qType, sType, sender: account.address, paymentCoinId: coins[0].coinObjectId, amount: amountRaw })
      : buildWithdrawTx({ vaultId: vault.vaultId, qType, sType, sender: account.address, shareCoinId: coins[0].coinObjectId, shareAmount: amountRaw });

    try {
      const res = await execute(tx);
      setStatus({ kind: "ok", digest: res.digest });
      setAmount("");
      qc.invalidateQueries({ queryKey: ["vault", vault.vaultId] });
      qc.invalidateQueries({ queryKey: ["vaults"] });
    } catch (e) {
      setStatus({ kind: "err", msg: (e as Error).message });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="floe-panel" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16, position: "sticky", top: 84 }}>
      <div className="k-seg" style={{ width: "100%" }}>
        {(["deposit", "withdraw"] as Mode[]).map((m) => (
          <button key={m} className={mode === m ? "active" : ""} style={{ flex: 1, width: "auto", textTransform: "capitalize", fontFamily: "var(--font-sans)", fontSize: 13 }} onClick={() => { setMode(m); setAmount(""); setStatus({ kind: "idle" }); }}>{m}</button>
        ))}
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <span className="floe-eyebrow">{isDeposit ? "Deposit" : "Withdraw"}</span>
          <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-subtle)" }}>
            balance {fmt6(total)} {meta.symbol}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", background: "var(--surface-raised)", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)", padding: "10px 12px" }}>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="0.00"
            inputMode="decimal"
            style={{ flex: 1, background: "none", border: "none", outline: "none", color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: 20, minWidth: 0 }}
          />
          <button className="k-btn k-btn--ghost k-btn--sm" onClick={() => setAmount((Number(total) / 10 ** meta.decimals).toString())}>MAX</button>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-muted)" }}>{meta.symbol}</span>
        </div>
      </div>

      {!account ? (
        <div className="k-btn k-btn--primary" style={{ justifyContent: "center", opacity: 0.6, cursor: "default" }}>Connect wallet to {mode}</div>
      ) : (
        <button className="k-btn k-btn--primary" style={{ width: "100%", justifyContent: "center", opacity: canSubmit ? 1 : 0.5, cursor: canSubmit ? "pointer" : "not-allowed" }} disabled={!canSubmit} onClick={submit}>
          {isPending ? "Confirming…" : frozen ? "Deposits paused" : insufficient ? "Insufficient balance" : isDeposit ? "Deposit" : "Withdraw"}
        </button>
      )}

      {isDeposit && account && (total === 0n || insufficient) && (
        <a href="https://faucet.sui.io/" target="_blank" rel="noreferrer"
          style={{ fontSize: 11.5, color: "var(--text-subtle)", lineHeight: 1.5, display: "inline-flex", alignItems: "center", gap: 5 }}>
          <Droplets size={12} /> Need testnet SUI for gas? Use the faucet ↗ · {qMeta.symbol} is sourced separately
        </a>
      )}

      {!isDeposit && (
        <p style={{ fontSize: 11.5, color: "var(--text-subtle)", lineHeight: 1.5 }}>
          Withdrawals are honored at full NAV when the floor is proven, and at the proven floor when attestation is stale — never overpaid, never blocked.
        </p>
      )}

      {status.kind === "ok" && (
        <a href={`https://suiscan.xyz/testnet/tx/${status.digest}`} target="_blank" rel="noreferrer" className="k-tag k-tag--positive" style={{ justifyContent: "center" }}>
          Confirmed · view on explorer
        </a>
      )}
      {status.kind === "err" && <div className="k-tag k-tag--caution" style={{ whiteSpace: "normal", height: "auto", padding: "6px 9px" }}>{status.msg?.slice(0, 120)}</div>}
    </div>
  );
}
