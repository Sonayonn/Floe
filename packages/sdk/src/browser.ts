// Browser-safe entry for @floe/sdk — excludes Node-only tooling (deploy/publish).
// Frontends import from here; Node consumers use the default index or ./node.
export { FloeClient, type FloeClientConfig } from './client.ts';
export { FLOE_ADDRESSES, FLOE_VERSION, type FloeNetwork, FLOE_VENUES, FLOE_ASSETS, assetFor, type VenueMeta, type VenueStatus, type AssetMeta } from './constants.ts';
export { getVaultState, getNav, getSharePrice, isAttested, type VaultState } from './vault/read.ts';
export { listVaults, type VaultSummary } from './registry/read.ts';
export { buildDepositTx, buildWithdrawTx, type VaultTxBase } from './vault/tx.ts';

// Floe Lend — attested-collateral money market. Browser-safe reads + tx builders.
// (registerCollateralAttester is admin-only Node tooling; harmless if unused in browser.)
export {
  poolState, fetchSignedValuation,
  supply, withdraw, lockAndBorrow, repay, liquidate, borrowAndTradePredict,
  type PoolState, type SignedValuation,
} from './lend/index.ts';
