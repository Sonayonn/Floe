"use client";
import { useCallback } from "react";
import { Transaction } from "@mysten/sui/transactions";
import { toBase64, fromBase64 } from "@mysten/sui/utils";
import {
  useCurrentAccount, useCurrentWallet, useSuiClient,
  useSignTransaction, useSignAndExecuteTransaction,
} from "@mysten/dapp-kit";
import { isEnokiWallet } from "@mysten/enoki";
import { ENOKI_ENABLED } from "@/lib/enoki";
import { useToast } from "@/components/ui/Toast";

export type FloeExecResult = { digest: string; objectChanges?: unknown[] };

/** Optional label for the toast, e.g. "Deposit", "Borrow". Defaults to "Transaction". */
export interface FloeExecOpts {
  label?: string;
  /** Refetch the confirmed block's objectChanges (needed by multi-step flows like deploy). */
  collectObjectChanges?: boolean;
}

// One-shot health check of the sponsorship backend (needs the server-only private key), cached for
// the session so we don't probe on every transaction.
let sponsorProbe: Promise<boolean> | null = null;
function sponsorshipAvailable(): Promise<boolean> {
  if (!sponsorProbe) {
    sponsorProbe = fetch("/api/enoki/sponsor")
      .then((r) => r.json())
      .then((j) => !!j.configured)
      .catch(() => false);
  }
  return sponsorProbe;
}

// Unified transaction executor: routes through the Enoki gas station (sponsored gas, so no-SUI users
// transact) when it's configured, otherwise has the user pay their own gas. For zkLogin sessions
// there is no user-paid fallback (no SUI to spend), so a sponsorship failure surfaces as an error.
export function useFloeExecute() {
  const account = useCurrentAccount();
  const { currentWallet } = useCurrentWallet();
  const client = useSuiClient();
  const { mutateAsync: signTransaction } = useSignTransaction();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const toast = useToast();

  return useCallback(
    async (tx: Transaction, opts: FloeExecOpts = {}): Promise<FloeExecResult> => {
      if (!account) throw new Error("No account connected");
      const sender = account.address; // capture once; narrowing isn't preserved into the nested run() closure
      const label = opts.label ?? "Transaction";
      const toastId = toast.push({ kind: "pending", title: `${label} submitted`, message: "Awaiting confirmation…" });
      const ok = async (digest: string): Promise<FloeExecResult> => {
        toast.update(toastId, { kind: "success", title: `${label} confirmed`, message: undefined, digest });
        if (!opts.collectObjectChanges) return { digest };
        const blk = await client.waitForTransaction({ digest, options: { showObjectChanges: true, showEffects: true } });
        return { digest, objectChanges: blk.objectChanges ?? [] };
      };
      const fail = (e: unknown): never => {
        const raw = (e as Error)?.message ?? "Transaction failed";
        toast.update(toastId, { kind: "error", title: `${label} failed`, message: humanizeTxError(raw) });
        throw e;
      };
      try {
        return await run();
      } catch (e) {
        return fail(e);
      }

      async function run(): Promise<FloeExecResult> {
      const isZkLogin = currentWallet ? isEnokiWallet(currentWallet) : false;
      const canSponsor = ENOKI_ENABLED && (await sponsorshipAvailable());

      if (canSponsor) {
        try {
          // 1) hand the transaction KIND to the gas station; it returns the full sponsored tx.
          const kindBytes = await tx.build({ client, onlyTransactionKind: true });
          const sponsor = await fetch("/api/enoki/sponsor", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              network: "testnet",
              transactionKindBytes: toBase64(kindBytes),
              sender,
            }),
          });
          if (!sponsor.ok) throw new Error((await sponsor.json()).error ?? "sponsor failed");
          const { bytes, digest } = await sponsor.json();

          // 2) user signs the sponsored bytes (sender signature only; gas is the station's).
          const { signature } = await signTransaction({ transaction: Transaction.from(fromBase64(bytes)) });

          // 3) gas station co-signs + executes.
          const exec = await fetch("/api/enoki/execute", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ digest, signature }),
          });
          if (!exec.ok) throw new Error((await exec.json()).error ?? "execute failed");
          const out = await exec.json();
          await client.waitForTransaction({ digest: out.digest });
          return ok(out.digest);
        } catch (e) {
          // zkLogin users can't pay their own gas — surface the failure rather than dead-end.
          if (isZkLogin) throw e;
          // browser-wallet users: fall through to user-paid gas below.
        }
      }

      const res = await signAndExecute({ transaction: tx });
      return ok(res.digest);
      }
    },
    [account, currentWallet, client, signTransaction, signAndExecute, toast],
  );
}

/** Turn common on-chain / wallet errors into a one-line human message for the toast. */
function humanizeTxError(raw: string): string {
  if (/EPriceStale|, 5\)/.test(raw)) return "The vault's attested price is refreshing — deposits pause until it's fresh.";
  if (/EDepositUnsafe|, 30\)/.test(raw)) return "NAV is being re-verified — deposits are paused as a safety measure.";
  if (/EInsufficientShares|, 3\)/.test(raw)) return "Not enough shares for that withdrawal.";
  if (/EDepositsFrozen|, 20\)/.test(raw)) return "Deposits are paused for this vault.";
  if (/Rejected|User rejected|cancell?ed/i.test(raw)) return "Cancelled in your wallet.";
  if (/budget|InsufficientGas|gas/i.test(raw)) return "Not enough gas — get testnet SUI from the faucet, or sign in with Google for sponsored gas.";
  return raw.length > 140 ? raw.slice(0, 140) + "…" : raw;
}
