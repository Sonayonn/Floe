"use client";
import { useQuery } from "@tanstack/react-query";
import { listVaults } from "@floe/sdk/browser";
import { getVaultState, type VaultState } from "@floe/sdk/browser";
import { FLOE_ADDRESSES } from "@floe/sdk/browser";
import { floeClient } from "../floe";
import { isHidden } from "../hidden";

export type VaultRow = VaultState & { name: string; strategyKind: string };

export function useVaults() {
  return useQuery<VaultRow[]>({
    queryKey: ["vaults"],
    queryFn: async () => {
      const floe = floeClient();
      const seed = FLOE_ADDRESSES.testnet.refVault;
      const listed = await listVaults(floe);
      const ids = new Map<string, { name: string; strategyKind: string }>();
      for (const v of listed) {
        if (isHidden(v.vaultId)) continue;
        ids.set(v.vaultId, { name: v.name, strategyKind: v.strategyKind });
      }
      if (seed && !ids.has(seed)) ids.set(seed, { name: "Floe Stratos", strategyKind: "structured" });
      const rows = await Promise.all(
        [...ids.entries()].map(async ([vaultId, meta]) => {
          const state = await getVaultState(floe, vaultId);
          return { ...state, ...meta };
        })
      );
      return rows;
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}
