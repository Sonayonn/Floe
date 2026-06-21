"use client";
import { useMemo, useState } from "react";
import { useCurrentAccount, useSuiClientQuery } from "@mysten/dapp-kit";
import { useQueryClient } from "@tanstack/react-query";
import {
  lockAndBorrowFromVault, repay,
  assetFor, FLOE_ADDRESSES,
} from "@floe/sdk/browser";
import { useCoins } from "@/lib/hooks/useCoins";
import { useFloeExecute } from "@/lib/hooks/useFloeExecute";
import { floeClient } from "@/lib/floe";
import type { LendMarket } from "@/lib/hooks/useLendMarket";
import { fmt6 } from "@/lib/format";

const LEND = FLOE_ADDRESSES.testnet.lend;

type Mode = "borrow" | "repay";
type Status = { kind: "idle" | "signing" | "ok" | "err"; msg?: string; digest?: string };

/** Health factor = collateralValue × liqThreshold / debt. >1 solvent; <1 liquidatable. */
function healthFactor(collateralValue: bigint, debt: bigint, liqThresholdBps: bigint): number {
  if (debt <= 0n) return Infinity;
  return (Number(collateralValue) * (Number(liqThresholdBps) / 10000)) / Number(debt);
}
function hfTone(hf: number): "ok" | "warn" | "danger" {
  if (hf >= 1.6) return "ok";
  if (hf >= 1.15) return "warn";
  return "danger";
}

export function BorrowPanel({ market }: { market: LendMarket }) {
  const account = useCurrentAccount();
  const qc = useQueryClient();
  const execute = useFloeExecute();
  const [isPending, setIsPending] = useState(false);

  const [mode, setMode] = useState<Mode>("borrow");
  const [collateral, setCollateral] = useState("");
  const [borrow, setBorrow] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const { qType, sType, pricePerShare, pool, vault, vaultId, poolId } = market;
  // Vault-read borrow values collateral at the vault's on-chain attested NAV floor — no enclave
  // round-trip. The only liveness condition is that the floor is FRESH (the contract aborts on a
  // stale NAV via is_price_fresh). Idle vaults are always fresh; PLP-holding vaults stay fresh via
  // the NAV heartbeat, so borrow pauses only while the heartbeat is down (degraded-stale).
  const staleNav = !vault.navFresh;
  const qMeta = assetFor(qType);
  const sMeta = assetFor(sType);

  // balances (coins sorted largest-first; the collateral split draws from the largest coin)
  const { coins: shareCoins } = useCoins(account?.address, sType);
  const { coins: qCoins, total: qBal } = useCoins(account?.address, qType);
  const shareSpendable = shareCoins[0] ? BigInt(shareCoins[0].balance) : 0n;

  // existing debt positions in this pool (for Repay)
  const debtType = `${LEND.package}::${LEND.module}::DebtPosition<${qType}, ${sType}>`;
  const owned = useSuiClientQuery(
    "getOwnedObjects",
    { owner: account?.address ?? "", filter: { StructType: debtType }, options: { showContent: true } },
    { enabled: !!account, refetchInterval: 20_000 }
  );
  const positions = useMemo(() => {
    return (owned.data?.data ?? [])
      .map((o) => {
        const f = (o.data?.content as any)?.fields;
        if (!f || f.pool_id !== poolId) return null;
        return { id: o.data!.objectId, collateral: BigInt(f.collateral ?? 0), debt: BigInt(f.debt_principal ?? 0) };
      })
      .filter(Boolean) as { id: string; collateral: bigint; debt: bigint }[];
  }, [owned.data, poolId]);
  const totalDebt = positions.reduce((s, p) => s + p.debt, 0n);

  // borrow math (6dp throughout)
  const collateralRaw = toRaw(collateral, sMeta.decimals);
  const borrowRaw = toRaw(borrow, qMeta.decimals);
  const collateralValue = (collateralRaw * pricePerShare) / 1_000_000n;       // in Q, 6dp
  const maxBorrow = (collateralValue * pool.ltvBps) / 10000n;
  const projectedHf = healthFactor(collateralValue, borrowRaw, pool.liqThresholdBps);

  const overLtv = borrowRaw > maxBorrow;
  const overLiquidity = borrowRaw > pool.availableLiquidity;
  const noCollateral = collateralRaw > shareSpendable;

  const canBorrow =
    !!account && collateralRaw > 0n && borrowRaw > 0n && !overLtv && !overLiquidity &&
    !noCollateral && shareCoins.length > 0 && !isPending && status.kind !== "signing" && !staleNav;

  async function doBorrow() {
    if (!account || shareCoins.length === 0) return;
    setStatus({ kind: "idle" });
    setIsPending(true);
    const floe = floeClient();
    // Vault-read path: the contract reads the attested floor straight off the vault and locks exactly
    // the typed collateral. No enclave call, no signed valuation — just an RPC read + the user's wallet.
    const tx = lockAndBorrowFromVault(floe, poolId, vaultId, shareCoins[0].coinObjectId, borrowRaw, qType, sType, account.address, collateralRaw);
    try {
      const res = await execute(tx);
      setStatus({ kind: "ok", digest: res.digest }); setBorrow(""); setCollateral(""); invalidate();
    } catch (e) {
      setStatus({ kind: "err", msg: (e as Error).message });
    } finally {
      setIsPending(false);
    }
  }

  async function doRepay() {
    if (!account || positions.length === 0 || qCoins.length === 0) return;
    setStatus({ kind: "idle" });
    setIsPending(true);
    const floe = floeClient();
    const tx = repay(floe, poolId, positions[0].id, qCoins[0].coinObjectId, qType, sType, account.address);
    try {
      const res = await execute(tx);
      setStatus({ kind: "ok", digest: res.digest }); invalidate();
    } catch (e) {
      setStatus({ kind: "err", msg: (e as Error).message });
    } finally {
      setIsPending(false);
    }
  }

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["lend-market"] });
    owned.refetch();
  }

  const isBorrow = mode === "borrow";
  const busy = isPending || status.kind === "signing";

  return (
    <div className="brw-rail floe-panel">
      <div className="k-seg" style={{ width: "100%" }}>
        {(["borrow", "repay"] as Mode[]).map((m) => (
          <button key={m} className={mode === m ? "active" : ""}
            style={{ flex: 1, width: "auto", textTransform: "capitalize", fontFamily: "var(--font-sans)", fontSize: 13 }}
            onClick={() => { setMode(m); setStatus({ kind: "idle" }); }}>{m}</button>
        ))}
      </div>

      {isBorrow ? (
        <>
          <Field
            label="Lock collateral" sym={sMeta.symbol} value={collateral} onChange={setCollateral}
            balance={`${fmt6(shareSpendable)} ${sMeta.symbol}`}
            onMax={() => setCollateral((Number(shareSpendable) / 10 ** sMeta.decimals).toString())}
          />
          <div className="brw-arrow">↓ collateral valued at the enclave-attested floor</div>
          <Field
            label="Borrow" sym={qMeta.symbol} value={borrow} onChange={setBorrow}
            balance={`max ${fmt6(maxBorrow)} ${qMeta.symbol}`}
            onMax={() => setBorrow((Number(maxBorrow) / 10 ** qMeta.decimals).toString())}
          />

          <dl className="brw-readout">
            <Row k="Collateral value" v={`${fmt6(collateralValue)} ${qMeta.symbol}`} sub="attested floor" />
            <Row k="Max LTV" v={`${(Number(pool.ltvBps) / 100).toFixed(0)}%`} />
            <Row k="Liquidation at" v={`${(Number(pool.liqThresholdBps) / 100).toFixed(0)}% LTV`} />
            <HfRow hf={projectedHf} show={borrowRaw > 0n && collateralRaw > 0n} />
          </dl>

          {staleNav && (
            <div className="brw-note">
              This vault's attested NAV floor is stale (the NAV heartbeat is catching up), so borrowing is
              paused — the contract refuses to lend against a stale valuation. Withdrawals still pay the floor,
              and borrow re-enables automatically within one heartbeat once the floor is fresh again.
            </div>
          )}

          {!account ? (
            <ConnectCta verb="borrow" />
          ) : (
            <button className="k-btn k-btn--primary brw-cta" disabled={!canBorrow}
              data-disabled={!canBorrow ? "1" : undefined} onClick={doBorrow}>
              {busy ? "Confirming…"
                : staleNav ? "Vault NAV stale"
                : noCollateral ? "Insufficient collateral"
                : overLiquidity ? "Exceeds pool liquidity"
                : overLtv ? "Exceeds max LTV"
                : "Borrow against SHARE"}
            </button>
          )}
        </>
      ) : (
        <>
          <dl className="brw-readout">
            <Row k="Your debt" v={`${fmt6(totalDebt)} ${qMeta.symbol}`} sub={positions.length ? `${positions.length} position${positions.length > 1 ? "s" : ""}` : "none"} />
            <Row k="Wallet balance" v={`${fmt6(qBal)} ${qMeta.symbol}`} />
          </dl>
          {positions.length === 0 ? (
            <div className="brw-note">No open borrow positions in this market. Lock SHARE collateral to borrow against your proven floor.</div>
          ) : (
            <p style={{ fontSize: 11.5, color: "var(--text-subtle)", lineHeight: 1.5 }}>
              Repaying returns your locked SHARE collateral and any overpayment in the same transaction.
            </p>
          )}
          {!account ? (
            <ConnectCta verb="repay" />
          ) : (
            <button className="k-btn k-btn--primary brw-cta"
              disabled={positions.length === 0 || qCoins.length === 0 || busy}
              data-disabled={positions.length === 0 || qCoins.length === 0 || busy ? "1" : undefined}
              onClick={doRepay}>
              {busy ? "Confirming…" : qCoins.length === 0 ? `No ${qMeta.symbol} to repay` : "Repay & unlock collateral"}
            </button>
          )}
        </>
      )}

      {status.kind === "signing" && (
        <div className="state-line" style={{ fontSize: 12 }}><span className="state-line__spinner" /> {status.msg}</div>
      )}
      {status.kind === "ok" && (
        <a href={`https://suiscan.xyz/testnet/tx/${status.digest}`} target="_blank" rel="noreferrer"
          className="k-tag k-tag--positive" style={{ justifyContent: "center" }}>
          Confirmed · view on explorer
        </a>
      )}
      {status.kind === "err" && (
        <div className="k-tag k-tag--caution" style={{ whiteSpace: "normal", height: "auto", padding: "6px 9px" }}>{status.msg?.slice(0, 160)}</div>
      )}
    </div>
  );
}

// ─── bits ──────────────────────────────────────────────────────────────────
function toRaw(s: string, decimals: number): bigint {
  const n = parseFloat(s);
  if (!isFinite(n) || n <= 0) return 0n;
  return BigInt(Math.floor(n * 10 ** decimals));
}

function Field({ label, sym, value, onChange, balance, onMax }: {
  label: string; sym: string; value: string; onChange: (v: string) => void; balance: string; onMax: () => void;
}) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span className="floe-eyebrow">{label}</span>
        <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-subtle)" }}>{balance}</span>
      </div>
      <div className="brw-input">
        <input value={value} onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="0.00" inputMode="decimal" />
        <button className="k-btn k-btn--ghost k-btn--sm" onClick={onMax}>MAX</button>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-muted)" }}>{sym}</span>
      </div>
    </div>
  );
}

function Row({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="brw-row">
      <dt>{k}</dt>
      <dd>{v}{sub && <span className="brw-row__sub"> · {sub}</span>}</dd>
    </div>
  );
}

function HfRow({ hf, show }: { hf: number; show: boolean }) {
  if (!show) return null;
  const tone = hfTone(hf);
  const txt = hf === Infinity ? "∞" : hf.toFixed(2);
  return (
    <div className="brw-row">
      <dt>Health factor</dt>
      <dd><span className="brw-hf" data-tone={tone}>{txt}</span></dd>
    </div>
  );
}

function ConnectCta({ verb }: { verb: string }) {
  return <div className="k-btn k-btn--primary brw-cta" style={{ opacity: 0.6, cursor: "default" }}>Connect wallet to {verb}</div>;
}
