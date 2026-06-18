"use client";
import { useQuery } from "@tanstack/react-query";
import { getVaultState, type VaultState } from "@floe/sdk/browser";
import { floeClient } from "../floe";

export function useVault(vaultId: string) {
  return useQuery<VaultState>({
    queryKey: ["vault", vaultId],
    queryFn: () => getVaultState(floeClient(), vaultId),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}
