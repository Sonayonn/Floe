/**
 * Floe — typed, documented registry of every on-chain ID.
 *
 * Single source of truth. The .env holds secrets (private key) and the values
 * we want to override per-environment; this file holds the public addresses
 * with comments explaining what each one is.
 *
 * Convention: every ID is a string starting with `0x`. Types (e.g. DUSDC) are
 * fully-qualified Move type strings.
 */

import 'dotenv/config';

// ─── Network ─────────────────────────────────────────────────────────────────

export const NETWORK = (process.env.SUI_NETWORK ?? 'testnet') as 'testnet' | 'mainnet';
export const RPC_URL = process.env.SUI_RPC_URL ?? 'https://fullnode.testnet.sui.io:443';

// ─── Secrets (from .env only) ────────────────────────────────────────────────

export const SUI_PRIVATE_KEY = mustEnv('SUI_PRIVATE_KEY');

// ─── Floe — the protocol we built ────────────────────────────────────────────

export const FLOE = {
  /** v1 package (canonical). v0 = 0x3317bc83… exists on chain but is superseded. */
  packageId: '0x262094a517a978302db1c9462139717478021197c1038984035cd46d2ac0b188',

  /** The live Vault<DUSDC> shared object. */
  vaultId: '0x00b83daae3cee3e706d9479a90ae4375d16932751cc87db567b2bca84c40f0fd',

  /** Operator authority — config, enclave registration, pause. */
  operatorCapId: '0x1b5d89db5d5f276b85491a90d5c5f050999f6fe414123670c7b56ac41fad6165',

  /** Rebalancer authority — strategy execution (deploy/range/hedge). */
  rebalancerCapId: '0x1dd8e85d4302fe4f2bedee032cf05d81faa633da15530a5e7097ec9761d4be47',

  /** TreasuryCap<FLOE> is locked inside the Vault; nothing should reference it externally. */
  // treasuryCap: locked in Vault

  /** Currency metadata (immutable, frozen by init). */
  coinMetadataId: '0xb5a9ef80661af0595eb125339eea1cef3fb1dd545ce11239c8f3d6f278989a39',

  /** UpgradeCap for the package — kept by operator, used for future upgrades. */
  upgradeCapId: '0x4fc3826bdcd7639ef2e43cb4362e9749c71751b596150109ff9b26077f507bf1',

  /** Module name within the package. */
  moduleName: 'floe',
} as const;

/** Convenience: fully-qualified Move type for the FLOE share token. */
export const FLOE_COIN_TYPE = `${FLOE.packageId}::${FLOE.moduleName}::FLOE` as const;

// ─── DeepBook — the protocol Floe composes on ────────────────────────────────

export const DEEPBOOK = {
  /** Floe's BalanceManager — holds DUSDC/SUI for Spot+Margin custody. */
  balanceManagerId: mustEnv('BALANCE_MANAGER_ID'),

  /** Floe's MarginManager — holds the Stratum C hedge position. */
  marginManagerId: mustEnv('MARGIN_MANAGER_ID'),
} as const;

// ─── Predict — the protocol Floe's vault writes positions on ─────────────────

export const PREDICT = {
  packageId: mustEnv('PREDICT_PACKAGE_ID'),
  /** The shared `Predict` object — the protocol's global state. */
  objectId: mustEnv('PREDICT_OBJECT_ID'),
  /** The shared `MarketRegistry`. */
  registryId: mustEnv('PREDICT_REGISTRY_ID'),
  /** Floe's PredictManager — holds PLP + Floe's positions. */
  managerId: mustEnv('PREDICT_MANAGER_ID'),

  /** Quote asset type (DUSDC on testnet). */
  quoteType: mustEnv('PREDICT_QUOTE_TYPE'),
  /** PLP coin type, returned by predict::supply<DUSDC>. */
  plpType: mustEnv('PREDICT_PLP_TYPE'),

  /** Public indexer/API base URL. */
  serverUrl: mustEnv('PREDICT_SERVER_URL'),
} as const;

// ─── Oracles ─────────────────────────────────────────────────────────────────

export const ORACLES = {
  /**
   * The June 12 BTC oracle — the long-dated tenor we anchor demos against.
   * The Floe demo range position 70k–85k was minted against this.
   * `_SHORT` and `_LONG` are currently the same value due to a .env merge
   * during Day 4; the actual minted position is against this long oracle.
   */
  btcJun12: '0x195833aeee071530d2bdcd2e03916b7458d57c81ed540b82d6e1cb594bdf41f2',
} as const;

// ─── Pyth — for Stratum C margin price freshness ─────────────────────────────

export const PYTH = {
  stateId: mustEnv('PYTH_STATE_ID'),
  wormholeStateId: mustEnv('WORMHOLE_STATE_ID'),
  /** Hermes endpoint (testnet uses hermes-beta). */
  hermesUrl: mustEnv('PYTH_HERMES_URL'),

  feeds: {
    suiUsd: mustEnv('PYTH_SUI_USD_FEED'),
  },
} as const;

// ─── Sui system objects ──────────────────────────────────────────────────────

export const SUI_SYSTEM = {
  clock: '0x6',
} as const;

// ─── Demo artifacts (already minted, referenced by frontend/demo) ────────────

export const DEMO = {
  /** Binary BTC>$77k Jun12 — first position minted. */
  binary: {
    tx: mustEnv('DEMO_BINARY_TX'),
    strike: BigInt(mustEnv('DEMO_BINARY_STRIKE')),
    isBull: mustEnv('DEMO_BINARY_IS_BULL') === 'true',
    oracleId: ORACLES.btcJun12,
  },
  /** Vertical range BTC $70k–$85k Jun12 — THE Floe demo position. */
  range: {
    tx: mustEnv('DEMO_RANGE_TX'),
    lower: BigInt(mustEnv('DEMO_RANGE_LOWER')),
    upper: BigInt(mustEnv('DEMO_RANGE_UPPER')),
    oracleId: ORACLES.btcJun12,
  },
} as const;

// ─── helper ──────────────────────────────────────────────────────────────────

function mustEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}