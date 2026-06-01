import type { FloeClient } from './client.ts';

export interface ProtocolRevenue {
  treasuryId: string;
  /** Fee-share coins held by the treasury, grouped by share type. */
  holdings: { coinType: string; balance: bigint }[];
}

/** Read Floe's protocol revenue — fee-share coins accrued to the FloeTreasury. */
export async function getProtocolRevenue(floe: FloeClient): Promise<ProtocolRevenue> {
  const owned = await floe.sui.getOwnedObjects({
    owner: floe.addresses.treasury,
    options: { showType: true, showContent: true },
  });
  const byType = new Map<string, bigint>();
  for (const o of owned.data) {
    const type = o.data?.type ?? '';
    const m = type.match(/Coin<(.+)>/);
    if (!m) continue;
    const bal = BigInt((o.data?.content as any)?.fields?.balance ?? 0);
    byType.set(m[1], (byType.get(m[1]) ?? 0n) + bal);
  }
  return {
    treasuryId: floe.addresses.treasury,
    holdings: [...byType].map(([coinType, balance]) => ({ coinType, balance })),
  };
}
