"use client";
import { useQuery } from "@tanstack/react-query";
import { poolState, getVaultState, FLOE_ADDRESSES, type PoolState, type VaultState } from "@floe/sdk/browser";
import { floeClient } from "../floe";

const A = FLOE_ADDRESSES.testnet;

export type LendMarket = {
  pool: PoolState;
  /** The vault whose SHARE collateralizes this pool (valuation basis). */
  vault: VaultState;
  poolId: string;
  vaultId: string;
  qType: string;   // borrow asset (dUSDC)
  sType: string;   // collateral asset (flShare)
  /** attested value of ONE share, 6dp — navLowerBound / shareSupply. The number a borrower cannot forge. */
  pricePerShare: bigint;
};

/** The live Floe Lend market: pool state (devInspect) + the vault valuation basis it lends against. */
export function useLendMarket() {
  return useQuery<LendMarket>({
    queryKey: ["lend-market", A.lend.refPool],
    queryFn: async () => {
      const floe = floeClient();
      const qType = A.refVaultQType;
      const sType = A.refVaultSType;
      const [pool, vault] = await Promise.all([
        poolState(floe, A.lend.refPool, qType, sType),
        getVaultState(floe, A.refVault),
      ]);
      const pricePerShare =
        vault.shareSupply > 0n ? (vault.navLowerBound * 1_000_000n) / vault.shareSupply : 0n;
      return {
        pool,
        vault,
        poolId: A.lend.refPool,
        vaultId: A.refVault,
        qType,
        sType,
        pricePerShare,
      };
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}
