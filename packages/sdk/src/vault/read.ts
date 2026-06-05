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
  const nav = idle + plpValue + marks;

  // ── circuit-breaker safety verdict (mirrors floe::nav_safety_status) ──
  const STALENESS_MS = 3_600_000n;      // PRICE_STALENESS_LIMIT_MS
  const MAX_DIVERGENCE_BPS = 500n;      // 5%
  const navLowerBound = idle + plpValue;            // excludes soft marks
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
