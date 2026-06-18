"use client";
import { useQuery } from "@tanstack/react-query";
import { FLOE_ADDRESSES, type VaultState } from "@floe/sdk/browser";
import { floeClient } from "../floe";

/** A single observed point in a vault's life — every value is real on-chain data
 *  (deposit/withdraw events) or the live snapshot. We never synthesize points. */
export interface HistoryPoint {
  t: number;                 // epoch ms
  sharePrice: number;        // unitless (1.0 = par) — only on NAV-priced events (deposits) + live
  tvl: number;               // net deposits to date (deposit amount − withdraw payout), 6dp → float
  kind: "deposit" | "withdraw" | "live";
}

export interface VaultHistory {
  points: HistoryPoint[];                 // sorted ascending, last point = live
  priceSeries: { t: number; v: number }[]; // NAV-priced points + live (clean line)
  tvlSeries: { t: number; v: number }[];   // net-deposits curve + live NAV
  growth: { d7: number | null; d30: number | null; d90: number | null };
  eventCount: number;                     // real lifetime events (excludes the live point)
  firstMs: number | null;                 // first event ts
  lastEventMs: number | null;             // most recent event ts
  spanDays: number;
}

const PKG = FLOE_ADDRESSES.testnet.packageOriginal; // events carry the genesis (type-origin) package id
const MODULE = FLOE_ADDRESSES.testnet.module;

type RawEvent = { timestampMs?: string | null; parsedJson?: Record<string, unknown> };

async function fetchEvents(type: string): Promise<RawEvent[]> {
  const sui = floeClient().sui;
  const out: RawEvent[] = [];
  let cursor: unknown = null;
  // tiny event volume on testnet — a couple of pages at most
  for (let i = 0; i < 5; i++) {
    const page = await sui.queryEvents({
      query: { MoveEventType: type },
      cursor: cursor as never,
      limit: 50,
      order: "ascending",
    });
    out.push(...(page.data as RawEvent[]));
    if (!page.hasNextPage || !page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return out;
}

/** Compute price growth over a trailing window. Returns null when history doesn't
 *  reach back far enough — we show "—" rather than a misleading number. */
function windowGrowth(series: { t: number; v: number }[], now: number, days: number): number | null {
  if (series.length < 2) return null;
  const target = now - days * 86_400_000;
  if (series[0].t > target) return null; // not enough history to cover this window
  let start = series[0];
  for (const p of series) {
    if (p.t <= target) start = p; else break;
  }
  const end = series[series.length - 1];
  if (start.v <= 0) return null;
  return end.v / start.v - 1;
}

export function useVaultHistory(vaultId: string, live?: VaultState | null) {
  const liveNav = live ? Number(live.nav) / 1e6 : null;
  const livePrice = live ? Number(live.sharePrice) / 1e6 : null;

  return useQuery<VaultHistory>({
    queryKey: ["vault-history", vaultId, liveNav, livePrice],
    enabled: !!live,
    staleTime: 60_000,
    queryFn: async () => {
      const [deposits, withdraws] = await Promise.all([
        fetchEvents(`${PKG}::${MODULE}::DepositEvent`),
        fetchEvents(`${PKG}::${MODULE}::WithdrawEvent`),
      ]);

      type Ev = { t: number; kind: "deposit" | "withdraw"; amount: bigint; shares: bigint; payout: bigint };
      const evs: Ev[] = [];
      for (const e of deposits) {
        const j = e.parsedJson ?? {};
        if (j.vault_id !== vaultId) continue;
        evs.push({
          t: Number(e.timestampMs ?? 0),
          kind: "deposit",
          amount: BigInt((j.amount as string) ?? "0"),
          shares: BigInt((j.shares as string) ?? "0"),
          payout: 0n,
        });
      }
      for (const e of withdraws) {
        const j = e.parsedJson ?? {};
        if (j.vault_id !== vaultId) continue;
        evs.push({
          t: Number(e.timestampMs ?? 0),
          kind: "withdraw",
          amount: 0n,
          shares: BigInt((j.shares as string) ?? "0"),
          payout: BigInt((j.payout as string) ?? "0"),
        });
      }
      evs.sort((a, b) => a.t - b.t);

      const points: HistoryPoint[] = [];
      const priceSeries: { t: number; v: number }[] = [];
      const tvlSeries: { t: number; v: number }[] = [];
      let netDeposits = 0; // 6dp float, running

      for (const e of evs) {
        if (e.kind === "deposit") {
          netDeposits += Number(e.amount) / 1e6;
          // deposits mint at the live NAV share price → a real price observation
          const price = e.shares > 0n ? Number(e.amount) / Number(e.shares) : 0;
          if (price > 0) priceSeries.push({ t: e.t, v: price });
          points.push({ t: e.t, sharePrice: price, tvl: netDeposits, kind: "deposit" });
        } else {
          netDeposits -= Number(e.payout) / 1e6;
          points.push({ t: e.t, sharePrice: NaN, tvl: netDeposits, kind: "withdraw" });
        }
        tvlSeries.push({ t: e.t, v: netDeposits });
      }

      // Append the live snapshot as the most-recent point (real, from getVaultState).
      // Price uses the live NAV share price; TVL carries the net-deposits total forward
      // (we only have flow events on-chain, never historical NAV — so the TVL series is
      // honestly "net deposited", never a mark-to-market reconstruction).
      const now = Date.now();
      if (livePrice != null && liveNav != null) {
        points.push({ t: now, sharePrice: livePrice, tvl: netDeposits, kind: "live" });
        priceSeries.push({ t: now, v: livePrice });
        tvlSeries.push({ t: now, v: netDeposits });
      }

      const firstMs = evs.length ? evs[0].t : null;
      const lastEventMs = evs.length ? evs[evs.length - 1].t : null;

      return {
        points,
        priceSeries,
        tvlSeries,
        growth: {
          d7: windowGrowth(priceSeries, now, 7),
          d30: windowGrowth(priceSeries, now, 30),
          d90: windowGrowth(priceSeries, now, 90),
        },
        eventCount: evs.length,
        firstMs,
        lastEventMs,
        spanDays: firstMs ? (now - firstMs) / 86_400_000 : 0,
      };
    },
  });
}
