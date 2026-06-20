"use client";
import { useQuery } from "@tanstack/react-query";
import { resolveExecCap } from "@floe/sdk/browser";
import { floeClient } from "../floe";

/**
 * The ExecCap the connected wallet holds for this vault, or null. Drives the
 * curator-only "Deploy" affordance — a vault's creator gets its ExecCap, so a
 * non-null result means "you operate this vault" (and the registry-looping keeper,
 * by design, can only touch vaults that delegated their cap via authorize_agent).
 */
export function useExecCap(vaultId: string, address?: string) {
  return useQuery<string | null>({
    queryKey: ["execCap", vaultId, address],
    enabled: !!address,
    queryFn: () => resolveExecCap(floeClient(), address!, vaultId),
    staleTime: 60_000,
  });
}
