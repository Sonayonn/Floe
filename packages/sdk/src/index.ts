export { FloeClient, type FloeClientConfig } from './client.ts';
export { FLOE_ADDRESSES, type FloeNetwork } from './constants.ts';

import * as vaultRead from './vault/read.ts';
import * as registry from './registry.ts';
import * as treasury from './treasury.ts';
import * as share from './share/publish.ts';
import * as shareTemplate from './share/template.ts';

/** Vault reads + (later) actions. */
export const FloeVault = { ...vaultRead };
/** The Earn directory. */
export const Registry = { ...registry };
/** Protocol revenue. */
export const Treasury = { ...treasury };
/** Per-vault share token publishing (coin_registry). */
export const Share = { ...share, ...shareTemplate };

export type { VaultState } from './vault/read.ts';
export type { VaultInfo } from './registry.ts';
export type { ProtocolRevenue } from './treasury.ts';
