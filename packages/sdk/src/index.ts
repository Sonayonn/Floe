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

export type { VaultState } from './vault/read.ts';
export type { VaultInfo } from './registry.ts';
export type { ProtocolRevenue } from './treasury.ts';

// Venue layer (the multi-venue spine)
export type { VenueModule, VenueValuation } from './venues/types.ts';
