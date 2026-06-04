export { FloeClient, type FloeClientConfig } from './client.ts';
export { FLOE_ADDRESSES, type FloeNetwork } from './constants.ts';

import * as vaultRead from './vault/read.ts';
import * as vaultDeploy from './vault/deploy.ts';
import * as registry from './registry.ts';
import * as treasury from './treasury.ts';
import * as share from './share/publish.ts';
import * as policyCfg from './config/policy.ts';
import * as feesCfg from './config/fees.ts';
import * as shareTemplate from './share/template.ts';
import * as vol from './vol/index.ts';
import * as attestation from './attestation/index.ts';
import * as agent from './agent/index.ts';
import * as walrus from './walrus/index.ts';

/** Vault reads + (later) actions. */
export const FloeVault = { ...vaultRead, ...vaultDeploy };
/** The Earn directory. */
export const Registry = { ...registry };
/** Protocol revenue. */
export const Treasury = { ...treasury };
/** Per-vault share token publishing (coin_registry). */
export const Share = { ...share, ...shareTemplate };
export const Policy = { ...policyCfg };
export const Fees = { ...feesCfg };
/** On-chain implied-volatility index (DeepBook Predict SVI oracle). */
export const Vol = { ...vol };
/** Verifiable NAV + vol — the Nautilus hardware-attestation moat. */
export const Attestation = { ...attestation };
/** Attenuated, revocable agent authority over a vault. */
export const Agent = { ...agent };
/** Tamper-evident audit trail — NAV/rebalance snapshots on Walrus, indexed on-chain. */
export const Walrus = { ...walrus };

export type { VaultState } from './vault/read.ts';
export type { VaultInfo } from './registry.ts';
export type { ProtocolRevenue } from './treasury.ts';
export type { VolSnapshot } from './vol/index.ts';
export type { EnclaveInfo } from './attestation/index.ts';
export type { AgentEntry, AuthorizeAgentOpts } from './agent/index.ts';
export type { FloeSnapshot, StoredBlob } from './walrus/index.ts';

// Venue layer (the multi-venue spine)
export type { VenueModule, VenueValuation } from './venues/types.ts';
export { DeepBookModule } from './venues/deepbook.ts';
export { CetusModule } from './venues/cetus.ts';
export { CETUS_TESTNET } from './venues/cetus-config.ts';

