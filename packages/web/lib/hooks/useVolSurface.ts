"use client";
import { useQuery } from "@tanstack/react-query";
import {
  resolveLiveOracles, buildVolSurface, attestedVol,
  type SVISlice, type VolSurface, type AttestedVolReading,
} from "@floe/sdk/browser";
import { floeClient } from "../floe";

export interface VolSurfaceData {
  /** Sampled surface grid (log-moneyness × tenor × IV%). */
  surface: VolSurface;
  /** The raw oracle slices (one per live expiry). */
  slices: SVISlice[];
  /** The enclave-attested ATM reading (the verifiable Floe Index), if registered. */
  attested: AttestedVolReading | null;
}

/** The live SVI volatility surface for an underlying — reconstructed entirely from DeepBook
 *  Predict's on-chain SVI oracles (one per expiry), plus the enclave-attested Floe Index reading.
 *  All reads are devInspect / object reads — no signer, no gas. */
export function useVolSurface(underlying = "BTC") {
  return useQuery<VolSurfaceData>({
    queryKey: ["vol-surface", underlying],
    queryFn: async () => {
      const floe = floeClient();
      const slices = await resolveLiveOracles(floe, { underlying });
      const surface = buildVolSurface(slices);
      let attested: AttestedVolReading | null = null;
      try { attested = await attestedVol(floe); } catch { attested = null; }
      return { surface, slices, attested };
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

/** Days-to-expiry for a slice (display). */
export const tteDays = (s: SVISlice): number => s.tteMs / 86_400_000;

/** Compact tenor label, e.g. "6h", "2.5d", "25d". */
export function tenorLabel(s: SVISlice): string {
  const d = tteDays(s);
  if (d < 1) return `${Math.round(d * 24)}h`;
  if (d < 10) return `${d.toFixed(1)}d`;
  return `${Math.round(d)}d`;
}
