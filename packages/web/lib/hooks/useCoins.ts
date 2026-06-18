"use client";
import { useSuiClientQuery } from "@mysten/dapp-kit";

/** Returns the user's coins of `coinType`, largest first, with total balance. */
export function useCoins(owner: string | undefined, coinType: string) {
  const q = useSuiClientQuery(
    "getCoins",
    { owner: owner ?? "", coinType },
    { enabled: !!owner, refetchInterval: 20_000 }
  );
  const coins = (q.data?.data ?? []).slice().sort((a, b) => (BigInt(b.balance) > BigInt(a.balance) ? 1 : -1));
  const total = coins.reduce((s, c) => s + BigInt(c.balance), 0n);
  return { coins, total, ...q };
}
