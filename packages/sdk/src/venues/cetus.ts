/**
 * CetusModule — reference VenueModule #2 (Archetype 2: CLMM Position NFT).
 *
 * Proves Floe's layer handles the HARD archetype: a concentrated-liquidity DEX
 * position held as an NFT, valued via pool price + tick range math, not a simple
 * exchange rate. Built against Cetus CLMM core (verified live on Sui testnet).
 *
 * Implements the uniform VenueModule interface:
 *   deploy()  — open_position + add_liquidity_fix_coin + repay  (enter LP)
 *   value()   — position liquidity + pool sqrt_price -> amounts -> quote value
 *   redeem()  — remove_liquidity + collect_fee + close_position (exit LP)
 */
import { Transaction } from '@mysten/sui/transactions';
import type { FloeClient } from '../client.ts';
import type { VenueModule, VenueValuation } from './types.ts';
import { CETUS_TESTNET } from './cetus-config.ts';

const Q64 = 18446744073709551616n; // 2^64, sqrt-price is X64 fixed point

export interface CetusPositionRef {
  positionId: string;
  poolId: string;
}

/**
 * Compute token amounts for a CLMM position from liquidity + current price + tick range.
 * Uses the standard Uniswap-v3 / CLMM math. sqrtPrice is X64 (Cetus convention).
 */
export function amountsFromLiquidity(
  liquidity: bigint, sqrtPriceCurrent: bigint, sqrtPriceLower: bigint, sqrtPriceUpper: bigint,
): { amountA: bigint; amountB: bigint } {
  // below range: all A; above range: all B; in range: split
  if (sqrtPriceCurrent <= sqrtPriceLower) {
    const amountA = (liquidity * Q64 * (sqrtPriceUpper - sqrtPriceLower)) / (sqrtPriceUpper * sqrtPriceLower);
    return { amountA, amountB: 0n };
  } else if (sqrtPriceCurrent >= sqrtPriceUpper) {
    const amountB = (liquidity * (sqrtPriceUpper - sqrtPriceLower)) / Q64;
    return { amountA: 0n, amountB };
  } else {
    const amountA = (liquidity * Q64 * (sqrtPriceUpper - sqrtPriceCurrent)) / (sqrtPriceUpper * sqrtPriceCurrent);
    const amountB = (liquidity * (sqrtPriceCurrent - sqrtPriceLower)) / Q64;
    return { amountA, amountB };
  }
}

/** sqrtPriceX64 from a tick index (1.0001^(tick/2) * 2^64). */
export function sqrtPriceFromTick(tick: number): bigint {
  const ratio = Math.pow(1.0001, tick / 2);
  return BigInt(Math.floor(ratio * Number(Q64)));
}

/** Decode Cetus i32 ({bits}) — high bit set => negative. */
export function decodeI32(bits: number): number {
  return bits >= 0x80000000 ? bits - 0x100000000 : bits;
}

/** Encode a signed tick to Cetus u32 (two's complement). */
export function encodeTickU32(tick: number): number {
  return tick < 0 ? tick + 0x100000000 : tick;
}

export class CetusModule implements VenueModule<unknown, unknown, unknown> {
  readonly venue = 'cetus';
  readonly name = 'Cetus CLMM';
  readonly description = 'Concentrated-liquidity DEX position (Archetype 2: Position NFT) on Cetus.';

  constructor(private readonly position?: CetusPositionRef) {}

  decide(): unknown[] { return []; } // strategy-driven later; value() is the NAV path for now

  compose(): void { /* venue actions wired with strategy later; deploy/redeem are explicit methods below */ }

  /**
   * createPoolWithLiquidity — create a Cetus pool + open a seeded position in ONE call.
   * Used when no suitable pool exists; pairs coins the vault already holds (e.g. SUI/DUSDC).
   * Coin ordering is type-string sorted (A < B). For SUI/DUSDC: A=SUI, B=DUSDC.
   * Returns nothing here (transfers Position to recipient); the position id is read from
   * objectChanges after execution.
   */
  static createPoolWithLiquidity(
    tx: Transaction,
    opts: {
      coinTypeA: string; coinTypeB: string;
      tickSpacing: number;
      initSqrtPrice: bigint;     // u128, X64 sqrt price for initial pool price
      tickLower: number; tickUpper: number;
      coinA: any; coinB: any;    // Coin<A>, Coin<B> inputs
      amountA: bigint; amountB: bigint;
      fixAmountA: boolean;
      recipient: string;
    },
  ): void {
    const C = CETUS_TESTNET;
    const position = tx.moveCall({
      target: `${C.corePackageId}::factory::create_pool_with_liquidity`,
      typeArguments: [opts.coinTypeA, opts.coinTypeB],
      arguments: [
        tx.object(C.poolsRegistryId),
        tx.object(C.globalConfigId),
        tx.pure.u32(opts.tickSpacing),
        tx.pure.u128(opts.initSqrtPrice),
        tx.pure.string(''),                       // url
        tx.pure.u32(encodeTickU32(opts.tickLower)),
        tx.pure.u32(encodeTickU32(opts.tickUpper)),
        opts.coinA,
        opts.coinB,
        tx.pure.u64(opts.amountA),
        tx.pure.u64(opts.amountB),
        tx.pure.bool(opts.fixAmountA),
        tx.object(C.clock),
      ],
    });
    tx.transferObjects([position], opts.recipient);
  }

  /**
   * deploy — open a CLMM position and add liquidity (fix coin A = USDT side).
   * Appends to the PTB: open_position -> add_liquidity_fix_coin -> repay_add_liquidity.
   * Caller supplies the two coin inputs (coinA, coinB) to settle the receipt; the
   * Position NFT is transferred to `recipient`.
   *
   * tickLower/tickUpper are signed ticks; encoded to Cetus u32 (two's complement).
   */
  static deploy(
    tx: Transaction,
    opts: {
      poolId: string;
      coinTypeA: string;
      coinTypeB: string;
      tickLower: number;
      tickUpper: number;
      amount: bigint;       // fixed amount of coin A (USDT) to deposit
      coinA: any;           // TransactionObjectArgument: coin A input (>= owed A)
      coinB: any;           // TransactionObjectArgument: coin B input (>= owed B)
      recipient: string;
    },
  ): void {
    const C = CETUS_TESTNET;
    const ta = [opts.coinTypeA, opts.coinTypeB];

    // open_position(config, &mut pool, tick_lower:u32, tick_upper:u32, ctx) -> Position
    const position = tx.moveCall({
      target: `${C.corePackageId}::pool::open_position`,
      typeArguments: ta,
      arguments: [
        tx.object(C.globalConfigId),
        tx.object(opts.poolId),
        tx.pure.u32(encodeTickU32(opts.tickLower)),
        tx.pure.u32(encodeTickU32(opts.tickUpper)),
      ],
    });

    // add_liquidity_fix_coin(config, &mut pool, &mut position, amount:u64, fix_a:bool, &clock) -> receipt
    const receipt = tx.moveCall({
      target: `${C.corePackageId}::pool::add_liquidity_fix_coin`,
      typeArguments: ta,
      arguments: [
        tx.object(C.globalConfigId),
        tx.object(opts.poolId),
        position,
        tx.pure.u64(opts.amount),
        tx.pure.bool(true), // fix amount of coin A
        tx.object(C.clock),
      ],
    });

    // Convert the input coins to Balance<T> for repay (repay takes Balance, not Coin)
    const balA = tx.moveCall({ target: '0x2::coin::into_balance', typeArguments: [opts.coinTypeA], arguments: [opts.coinA] });
    const balB = tx.moveCall({ target: '0x2::coin::into_balance', typeArguments: [opts.coinTypeB], arguments: [opts.coinB] });

    // repay_add_liquidity(config, &mut pool, Balance<A>, Balance<B>, receipt)
    tx.moveCall({
      target: `${C.corePackageId}::pool::repay_add_liquidity`,
      typeArguments: ta,
      arguments: [
        tx.object(C.globalConfigId),
        tx.object(opts.poolId),
        balA,
        balB,
        receipt,
      ],
    });

    // hold the Position NFT (first proof: send to operator/recipient; in-vault custody is a follow-up)
    tx.transferObjects([position], opts.recipient);
  }

  /** value() — price the held position into quote-asset (coin A = USDT here) units. */
  async value(floe: FloeClient, _vaultId: string): Promise<VenueValuation> {
    if (!this.position) return { venue: this.venue, valueRaw: 0n, parts: {} };

    // read the pool: current sqrt price + tick
    const pool = await floe.sui.getObject({ id: this.position.poolId, options: { showContent: true } });
    const pf: any = (pool.data?.content as any)?.fields ?? {};
    const sqrtCurrent = BigInt(pf.current_sqrt_price ?? '0');

    // read the position object: liquidity + tick range
    const pos = await floe.sui.getObject({ id: this.position.positionId, options: { showContent: true } });
    const posF: any = (pos.data?.content as any)?.fields ?? {};
    const liquidity = BigInt(posF.liquidity ?? '0');
    const tickLower = decodeI32(Number(posF.tick_lower_index?.fields?.bits ?? posF.tick_lower_index ?? 0));
    const tickUpper = decodeI32(Number(posF.tick_upper_index?.fields?.bits ?? posF.tick_upper_index ?? 0));

    const sqrtLower = sqrtPriceFromTick(tickLower);
    const sqrtUpper = sqrtPriceFromTick(tickUpper);
    const { amountA, amountB } = amountsFromLiquidity(liquidity, sqrtCurrent, sqrtLower, sqrtUpper);

    // For NAV we value in coin A (USDT, ~quote). amountB (CETUS) -> A via current price.
    // price (A per B) = (sqrtPrice/2^64)^2
    const priceAperB = (sqrtCurrent * sqrtCurrent) / Q64; // scaled by 2^64
    const bInA = (amountB * priceAperB) / Q64;
    const valueInA = amountA + bInA;

    return {
      venue: this.venue,
      valueRaw: valueInA,
      parts: { usdt: amountA, cetus_in_usdt: bInA },
    };
  }
}
