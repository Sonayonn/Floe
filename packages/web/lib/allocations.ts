import { FLOE_VENUES, type VaultState, type VenueStatus } from "@floe/sdk/browser";
import type { Allocation } from "@/components/ui/AllocationBar";

export interface MandateVenue { key: string; name: string; status: VenueStatus; }

/** The venues a vault operates on — its mandate identity, not just where capital
 *  currently sits. DeepBook Predict is the base venue for every Floe vault (the
 *  PLP floor + range/hedge strata are all DeepBook Predict); Cetus is added for
 *  multi-venue strategies. Live capital allocation is shown separately by
 *  {@link deriveAllocations} / the allocation bar. */
export function vaultVenues(strategyKind: string): MandateVenue[] {
  const sk = (strategyKind ?? "").toLowerCase();
  const keys = sk.includes("multi") ? ["deepbook", "lending", "cetus"]
    : sk.includes("cetus") ? ["deepbook", "cetus"]
    : ["deepbook"];
  return keys
    .map((k) => FLOE_VENUES.find((v) => v.key === k))
    .filter((v): v is NonNullable<typeof v> => !!v)
    .map((v) => ({ key: v.key, name: v.name, status: v.status }));
}

/** Derive venue allocation from real VaultState fields. Honest: idle + PLP (DeepBook) + position
 *  marks + the Cetus CLMM sleeve + the floe_lend sleeve. Each venue line appears only once a position
 *  is actually custodied in the vault (value > 0) — never a fabricated mandate segment. */
export function deriveAllocations(v: VaultState): { allocations: Allocation[]; total: bigint } {
  const plpValue = (v.plpHeld * v.plpPrice) / 1_000_000_000n; // 9dp price
  const allocations: Allocation[] = [
    { venue: "deepbook", label: "DeepBook Predict", amount: plpValue + v.positionsMarkTotal, live: true },
  ];
  if (v.cetusValue > 0n) {
    allocations.push({ venue: "cetus", label: "Cetus CLMM", amount: v.cetusValue, live: true });
  }
  if (v.lendValue > 0n) {
    allocations.push({ venue: "lending", label: "Floe Lend", amount: v.lendValue, live: true });
  }
  allocations.push({ venue: "idle", label: "Idle reserve", amount: v.idle, live: true });
  const total = allocations.reduce((s, a) => s + a.amount, 0n);
  return { allocations, total };
}
