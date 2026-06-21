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

export type FloeExecResult = { digest: string };

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

  return useCallback(
    async (tx: Transaction): Promise<FloeExecResult> => {
      if (!account) throw new Error("No account connected");
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
              sender: account.address,
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
          return { digest: out.digest };
        } catch (e) {
          // zkLogin users can't pay their own gas — surface the failure rather than dead-end.
          if (isZkLogin) throw e;
          // browser-wallet users: fall through to user-paid gas below.
        }
      }

      const res = await signAndExecute({ transaction: tx });
      return { digest: res.digest };
    },
    [account, currentWallet, client, signTransaction, signAndExecute],
  );
}
