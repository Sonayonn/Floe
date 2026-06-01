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
  packageId: '0x1aacf4f9f787807d811c058e4a3194f48b2ad30f50096c0713668b656bbd6003',

  /** The live Vault<DUSDC> shared object. */
  vaultId: '0xea33fe41c7512a1a36be417b0ce400ada0db0d9fe54f2ade75662aaef987de2e',

  /** Operator authority — config, enclave registration, pause. */
  ownerCapId: '0x1c177a80d8ea78b84884944292f9f9af657308c64d5877028de718ff5f851f1e',

  /** Rebalancer authority — strategy execution (deploy/range/hedge). */
  execCapId: '0x453356286d5240164af6fe5973adf9d46c18b9b8c4231ffc80e03dd9ea75c10e',
  curatorCapId: '0xd2c21b75c54d17a3328bb30beb7a1c4728e829618843331611ee1daa0fe240b3',
  registryId: '0x3462badecc7b4274b222f3b2bf0f0ddab572c294336ec8e7c7d62f42bf1a2f45',
  treasuryId: '0x756dbb6350b61e838afcb81fd1c53975af7b51756f6cc0f6d1981b7df8b2639e',
  agentRegistryId: '0xabf57ae9db406f0c74922e1857da855f00fcb2396ec4ccece9af8af5ffd06ba9',
  sharePackageId: '0x120c29a65c10ada7619429e46a608531cfcb4affe14439ca6838aaa77dfd029f',
  shareType: '0x120c29a65c10ada7619429e46a608531cfcb4affe14439ca6838aaa77dfd029f::share::SHARE',



  /** UpgradeCap for the package — kept by operator, used for future upgrades. */
  upgradeCapId: '0x7a171ad8070516a29c3060acd095cdcd02f5fcbbffc548a48f68b91996d799b7',

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