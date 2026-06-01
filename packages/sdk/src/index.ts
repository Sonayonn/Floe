export { FloeClient, type FloeClientConfig } from './client.ts';
export { FLOE_ADDRESSES, type FloeNetwork } from './constants.ts';

import * as vaultRead from './vault/read.ts';
import * as registry from './registry.ts';
import * as treasury from './treasury.ts';

/** Vault reads + (later) actions. */
export const FloeVault = { ...vaultRead };
/** The Earn directory. */
export const Registry = { ...registry };
/** Protocol revenue. */
export const Treasury = { ...treasury };

export type { VaultState } from './vault/read.ts';
export type { VaultInfo } from './registry.ts';
export type { ProtocolRevenue } from './treasury.ts';
