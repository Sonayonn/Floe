// Browser-safe entry for @floe/sdk — excludes Node-only tooling (deploy/publish).
// Frontends import from here; Node consumers use the default index or ./node.
export { FloeClient, type FloeClientConfig } from './client.ts';
export { FLOE_ADDRESSES, FLOE_VERSION, type FloeNetwork, FLOE_VENUES, FLOE_ASSETS, assetFor, type VenueMeta, type VenueStatus, type AssetMeta } from './constants.ts';
export { getVaultState, getNav, getSharePrice, isAttested, type VaultState } from './vault/read.ts';
export { listVaults, type VaultSummary } from './registry/read.ts';
export { buildDepositTx, buildWithdrawTx, buildDeployPlpTx, buildDeployCetusTx, resolveExecCap, type VaultTxBase } from './vault/tx.ts';
// In-app vault deploy — browser-signed 3-tx curator pipeline + objectChanges extractors.
export {
  buildPublishShareTx, buildProvisionManagersTx, buildDeployVaultTx,
  extractPublishedShare, extractManagers, extractDeployedVault,
  type DeployVaultTxInput, type DeployVaultPolicyInput, type DeployVaultFeesInput,
} from './vault/tx.ts';

// Floe Index — on-chain implied volatility. Browser-safe reads (devInspect / object reads, no signer).
export {
  volNow, currentVol, attestedVol, resolveLiveOracle, volAttester, bpsToPercent,
  // SVI surface — raw smile reconstruction across the live term structure.
  readOracleSVI, resolveLiveOracles, sviTotalVariance, sviIvBps, buildVolSurface,
  type VolSnapshot, type AttestedVolReading, type SVISlice, type VolSurface,
} from './vol/index.ts';

// Forward APY projection — comparable, inspectable estimate for every vault (pure; no network).
export {
  estimateApy, estimateApyForVault, mandateMix, apyPct, YIELD_MODEL,
  type ApyEstimate, type ApyComponent,
} from './yield/index.ts';

// Floe Lend — attested-collateral money market. Browser-safe reads + tx builders.
// (V2: collateral valuations verify against the on-chain Enclave<FLOE_NAV> object — no attester to register.)
export {
  poolState, fetchSignedValuation,
  supply, withdraw, lockAndBorrow, repay, liquidate, borrowAndTradePredict,
  // Vault-read borrow path (no enclave round-trip): browser borrows by passing only the vault.
  lockAndBorrowFromVault, liquidateFromVault, healthFactorFromVault,
  type PoolState, type SignedValuation,
} from './lend/index.ts';
