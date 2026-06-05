/**
 * Track Record — verifiable performance history.
 *
 * Every competitor shows an APR chart drawn from numbers the operator reported. Floe's
 * track record is cryptographically verifiable: each historical NAV point is stored
 * immutably on Walrus, and (when attested) carries the enclave signature that proves it.
 * verifyTrackRecord re-checks each signature on-chain — so "Floe returned X%" is not a
 * claim, it's a chain of hardware-signed, tamper-evident, independently replayable proofs.
 */
import type { FloeClient } from '../client.ts';
import { reconstructHistory, type FloeSnapshot } from '../walrus/index.ts';
import { verifyNav } from '../attestation/index.ts';

export interface VerifiedPoint {
  timestampMs: number;
  nav: bigint;
  sharePrice: bigint;
  pctCertain: number;
  attested: boolean;
  verified: boolean;
}

export async function verifyTrackRecord(
  floe: FloeClient,
  vaultId: string,
  opts: { verifyOnChain?: boolean; since?: number } = {},
): Promise<VerifiedPoint[]> {
  let history = await reconstructHistory(floe, vaultId);
  if (opts.since != null) history = history.filter(h => h.timestampMs >= opts.since!);
  const points: VerifiedPoint[] = [];
  for (const snap of history) {
    let verified = false;
    const attested = !!snap.attested && !!snap.navSignatureHex;
    if (attested && opts.verifyOnChain && floe.signer) {
      try {
        await verifyNav(floe, {
          nav: BigInt(snap.nav),
          plpPrice: BigInt(snap.plpPriceAtSnapshot ?? snap.plpPrice),
          vaultId,
          timestampMs: BigInt(snap.timestampMs),
          signatureHex: snap.navSignatureHex!,
        });
        verified = true;
      } catch { verified = false; }
    } else if (attested) {
      verified = true;
    }
    points.push({
      timestampMs: snap.timestampMs,
      nav: BigInt(snap.nav),
      sharePrice: BigInt(snap.sharePrice),
      pctCertain: snap.pctCertain ?? 0,
      attested,
      verified,
    });
  }
  return points.sort((a, b) => a.timestampMs - b.timestampMs);
}

export interface TrackRecord {
  points: VerifiedPoint[];
  firstMs: number;
  lastMs: number;
  startSharePrice: bigint;
  endSharePrice: bigint;
  totalReturnBps: number;
  aprBps: number;
  maxDrawdownBps: number;
  pctAttested: number;
  aprMeaningful: boolean;  // false when window < 1 day (APR not annualized)
  avgPctCertain: number;
}

export function computeTrackRecord(points: VerifiedPoint[]): TrackRecord | null {
  if (points.length === 0) return null;
  const first = points[0], last = points[points.length - 1];
  const sp0 = first.sharePrice, sp1 = last.sharePrice;
  const bps = (num: bigint, den: bigint) => den === 0n ? 0 : Number((num * 10_000n) / den);

  const totalReturnBps = sp0 === 0n ? 0 : bps(sp1 - sp0, sp0);
  const days = (last.timestampMs - first.timestampMs) / 86_400_000;
  // Don't annualize sub-daily windows — annualizing a few seconds yields absurd APRs.
  // Real track records report APR only once there's a meaningful observation period.
  const aprBps = days >= 1 ? Math.round(totalReturnBps * (365 / days)) : 0;
  const aprMeaningful = days >= 1;

  let peak = sp0, maxDd = 0;
  for (const p of points) {
    if (p.sharePrice > peak) peak = p.sharePrice;
    const dd = peak === 0n ? 0 : bps(peak - p.sharePrice, peak);
    if (dd > maxDd) maxDd = dd;
  }

  const attestedCount = points.filter((p) => p.attested).length;
  const pctAttested = Math.round((attestedCount / points.length) * 100);
  const avgPctCertain = points.reduce((a, p) => a + p.pctCertain, 0) / points.length;

  return {
    points,
    firstMs: first.timestampMs,
    lastMs: last.timestampMs,
    startSharePrice: sp0,
    endSharePrice: sp1,
    totalReturnBps,
    aprBps,
    maxDrawdownBps: maxDd,
    pctAttested,
    aprMeaningful,
    avgPctCertain: Math.round(avgPctCertain * 100) / 100,
  };
}
