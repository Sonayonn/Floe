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
  packageId: '0x0fd9662dc900bce48de57a9d1ac6e98d02ff1ce4b1f49b2393e4a776b40d8a9d',

  /** The live Vault<DUSDC> shared object. */
  vaultId: '0xea332cc1ae1a4d0903240bc3a65cea4b0894e6a78d4c10b3153cec79a9a8bfbe',

  /** Operator authority — config, enclave registration, pause. */
  ownerCapId: '0x96dd8474eea55f9c7602789e6310b064b9b96549edb3123d2f070e74d4868103',

  /** Rebalancer authority — strategy execution (deploy/range/hedge). */
  execCapId: '0x8671ff2e5668b00aa40eb2d7c903e3d239994ccc27577139d6b33d6e26f12aef',
  curatorCapId: '0xd197c4984907a8d2d9bc432c23281073b490089b91e3511d51dd373dea9e12a8',
  registryId: '0xb1fe225b5e712b8ee2c51a7e76ac0c27732a29834367883004ce358ccb9b1762',
  sharePackageId: '0xf49b15cd71c0a9cb7a63ddbcd3a425ec3942ce953a0a3b40b4c0f5f0767f8c23',
  shareType: '0xf49b15cd71c0a9cb7a63ddbcd3a425ec3942ce953a0a3b40b4c0f5f0767f8c23::share::SHARE',



  /** UpgradeCap for the package — kept by operator, used for future upgrades. */
  upgradeCapId: '0xe3f3762eddf5e0cbafb5762baab8d374eebae60397d350fd2993c1ccba06ff20',

  /** Module name within the package. */
  moduleName: 'floe',
} as const;

/** Convenience: fully-qualified Move type for the FLOE share token. */
export const FLOE_SHARE_TYPE = FLOE.shareType;

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
  // Use the SDK-shipped testnet state. The .env originally had 0xd3e79c…
// (which also works on testnet, both states are active), but DeepBook Margin
// reads from the SDK's config, so we standardize on the SDK's value.
stateId: '0x243759059f4c3111179da5878c12f68d612c21a8d54d85edc86164bb18be1c7c',
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