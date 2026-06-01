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
