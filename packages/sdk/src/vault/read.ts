import type { FloeClient } from '../client.ts';
import { INITIAL_SHARE_PRICE, PLP_PRICE_SCALE } from '../constants.ts';

export interface VaultState {
  vaultId: string;
  curator: string;
  owner: string;
  paused: boolean;
  depositsFrozen: boolean;
  shareSupply: bigint;
  idle: bigint;
  plpHeld: bigint;
  plpPrice: bigint;          // 9dp
  positionsMarkTotal: bigint;
  cetusValue: bigint;        // cached quote-value of the in-vault Cetus CLMM position (0 if none) — soft mark
  lendValue: bigint;         // cached quote-value of the in-vault floe_lend supply position (0 if none) — hard, in floor
  positionCount: bigint;
  nav: bigint;               // total assets, 6dp
  sharePrice: bigint;        // 6dp
  managementFeeBps: bigint;
  performanceFeeBps: bigint;
  protocolFeeBps: bigint;
  attested: boolean;
  maxCapacity: bigint;
  version: bigint;
  plpPriceUpdatedMs: bigint;
  priceIsStale: boolean;   // true if vault holds PLP but price is 0/old
  // Circuit-breaker safety (mirrors the contract's nav_safety_status, computed client-side)
  navLowerBound: bigint;       // trustless floor: idle + PLP×price (excludes soft marks)
  navFresh: boolean;           // attested NAV within the freshness window
  navWithinDivergence: boolean;// full NAV agrees with the lower bound (<= 5%)
  navSafe: boolean;            // aggregate: safe to deposit / redeem at full NAV
  navSafetyLabel: 'verified' | 'unattested' | 'degraded-stale' | 'degraded-divergent';
  settledTotal: bigint;
  unsettledMarks: bigint;
  pctCertain: number;
}

function f(obj: any): any {
  return obj?.data?.content?.fields ?? {};
}

/** Read full vault state + computed NAV/share price (client-side, mirrors the contract). */
export async function getVaultState(floe: FloeClient, vaultId: string): Promise<VaultState> {
  const o = await floe.sui.getObject({ id: vaultId, options: { showContent: true } });
  const v = f(o);
  const fees = v.fees?.fields ?? {};
  const policy = v.policy?.fields ?? {};

  const idle = BigInt(v.idle ?? 0);
  const plpHeld = BigInt(v.plp_held ?? 0);
  const plpPrice = BigInt(v.plp_price_cached ?? 0);
  const marks = BigInt(v.positions_mark_total ?? 0);
  const supply = BigInt(v.share_supply ?? 0);

  const plpValue = (plpHeld * plpPrice) / PLP_PRICE_SCALE;
  // Settlement-aware: read the SettledTotal dynamic field (certain, resolved value). Its key type
  // is tagged with whichever package version was live when the field was created — which varies
  // across upgrades — so a hardcoded `${package}::${module}::SettledTotal` lookup silently misses
  // (and drops the settled value from NAV). Enumerate the fields and suffix-match instead.
  // Both SettledTotal and CetusValueKey are dynamic fields whose key type carries whichever
  // package version created them (varies across upgrades) — so a hardcoded lookup silently
  // misses. Enumerate once and suffix-match both. (CetusValueKey caches the Cetus sleeve value.)
  let settledTotal = 0n;
  let cetusValue = 0n;
  let lendValue = 0n;
  try {
    let cursor: string | null | undefined = null;
    let foundSettled = false, foundCetus = false, foundLend = false;
    scan: for (;;) {
      const page = await floe.sui.getDynamicFields({ parentId: vaultId, cursor });
      for (const fld of page.data) {
        if (!foundSettled && fld.name.type.endsWith(`::${floe.addresses.module}::SettledTotal`)) {
          const obj = await floe.sui.getObject({ id: fld.objectId, options: { showContent: true } });
          const val = (obj.data?.content as any)?.fields?.value;
          if (val != null) settledTotal = BigInt(val);
          foundSettled = true;
        } else if (!foundCetus && fld.name.type.endsWith(`::${floe.addresses.module}::CetusValueKey`)) {
          const obj = await floe.sui.getObject({ id: fld.objectId, options: { showContent: true } });
          const val = (obj.data?.content as any)?.fields?.value;
          if (val != null) cetusValue = BigInt(val);
          foundCetus = true;
        } else if (!foundLend && fld.name.type.endsWith(`::${floe.addresses.module}::LendValueKey`)) {
          const obj = await floe.sui.getObject({ id: fld.objectId, options: { showContent: true } });
          const val = (obj.data?.content as any)?.fields?.value;
          if (val != null) lendValue = BigInt(val);
          foundLend = true;
        }
        if (foundSettled && foundCetus && foundLend) break scan;
      }
      if (!page.hasNextPage) break;
      cursor = page.nextCursor;
    }
  } catch { /* no settled / cetus / lend positions yet */ }
  const unsettledMarks = marks;
  // cetusValue is a soft mark (excluded from the floor below); lendValue is HARD (principal × a
  // monotonic on-chain index) so — like settledTotal — it counts in the floor too. Mirrors total_assets.
  const nav = idle + plpValue + unsettledMarks + settledTotal + cetusValue + lendValue;

  // ── circuit-breaker safety verdict (mirrors floe::nav_safety_status) ──
  const STALENESS_MS = 3_600_000n;      // PRICE_STALENESS_LIMIT_MS
  const MAX_DIVERGENCE_BPS = 500n;      // 5%
  const navLowerBound = idle + plpValue + settledTotal + lendValue; // floor includes settled + lend (both hard)
  const updatedMs = BigInt(v.plp_price_updated_ms ?? 0);
  const nowMs = BigInt(Date.now());
  const attestedFlag = (v.fees?.fields ?? {}).attested ?? false;
  const navFresh = plpHeld === 0n
    ? true
    : updatedMs > 0n && nowMs - updatedMs <= STALENESS_MS;
  const excess = nav > navLowerBound ? nav - navLowerBound : 0n;
  const divBps = navLowerBound === 0n ? 0n : (excess * 10_000n) / navLowerBound;
  const navWithinDivergence = divBps <= MAX_DIVERGENCE_BPS;
  const navSafe = navFresh && (attestedFlag ? navWithinDivergence : true);
  const navSafetyLabel: VaultState['navSafetyLabel'] =
    !attestedFlag ? 'unattested'
    : navSafe ? 'verified'
    : !navFresh ? 'degraded-stale'
    : 'degraded-divergent';
  const pctCertain = nav === 0n ? 100 : Number((navLowerBound * 10_000n) / nav) / 100;
  const navSafety = { navLowerBound, navFresh, navWithinDivergence, navSafe, navSafetyLabel };
  const sharePrice = supply === 0n ? INITIAL_SHARE_PRICE : (nav * INITIAL_SHARE_PRICE) / supply;

  return {
    vaultId,
    curator: v.curator,
    owner: v.owner,
    paused: v.paused,
    depositsFrozen: v.deposits_frozen,
    shareSupply: supply,
    idle, plpHeld, plpPrice,
    positionsMarkTotal: marks,
    cetusValue,
    lendValue,
    positionCount: BigInt(v.position_count ?? 0),
    nav, sharePrice,
    managementFeeBps: BigInt(fees.management_fee_bps ?? 0),
    performanceFeeBps: BigInt(fees.performance_fee_bps ?? 0),
    protocolFeeBps: BigInt(fees.protocol_fee_bps ?? 0),
    attested: fees.attested ?? false,
    maxCapacity: BigInt(v.max_capacity ?? 0),
    version: BigInt(v.version ?? 0),
    plpPriceUpdatedMs: BigInt(v.plp_price_updated_ms ?? 0),
    priceIsStale: plpHeld > 0n && plpPrice === 0n,
    ...navSafety,
    settledTotal, unsettledMarks, pctCertain,
  };
}

export async function getNav(floe: FloeClient, vaultId: string): Promise<bigint> {
  return (await getVaultState(floe, vaultId)).nav;
}
export async function getSharePrice(floe: FloeClient, vaultId: string): Promise<bigint> {
  return (await getVaultState(floe, vaultId)).sharePrice;
}
export async function isAttested(floe: FloeClient, vaultId: string): Promise<boolean> {
  return (await getVaultState(floe, vaultId)).attested;
}
