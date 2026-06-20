"use client";
import { useQuery } from "@tanstack/react-query";
import { currentVol, volNow, resolveLiveOracle } from "@floe/sdk/browser";
import { floeClient } from "../floe";

const FRESH_WINDOW_MS = 600_000; // 10 min — matches the contract's VOL_FRESH_WINDOW_MS

export interface VolReading {
  /** On-chain snapshot (the Floe Index object), refreshed by the keeper. */
  indexBps: bigint;
  spot: bigint;
  samples: bigint;
  updatedMs: bigint;
  fresh: boolean;
  /** Guaranteed-live ATM IV computed on-chain right now from a live SVI oracle (no signer). */
  liveBps: bigint;
}

/** The Floe implied-volatility index — both the stored on-chain snapshot (with freshness) and a
 *  live devInspect compute against a runtime-resolved live oracle, so a number always renders. */
export function useVol() {
  return useQuery<VolReading>({
    queryKey: ["vol"],
    queryFn: async () => {
      const floe = floeClient();
      const snap = await currentVol(floe);
      // Live compute against a freshly-resolved live oracle (Predict rolls series hourly).
      let liveBps = 0n;
      try {
        const oracleId = await resolveLiveOracle(floe, { underlying: "BTC" });
        liveBps = await volNow(floe, oracleId);
      } catch {
        try { liveBps = await volNow(floe); } catch { /* leave 0 */ }
      }
      const fresh = snap.updatedMs > 0n && Date.now() - Number(snap.updatedMs) <= FRESH_WINDOW_MS;
      return {
        indexBps: snap.volBps, spot: snap.spot, samples: snap.samples,
        updatedMs: snap.updatedMs, fresh, liveBps,
      };
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

/** bps → human percent string, e.g. 3156n → "31.56%". */
export const volPct = (bps: bigint): string => `${(Number(bps) / 100).toFixed(2)}%`;
