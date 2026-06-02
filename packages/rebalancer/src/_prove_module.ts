import { FloeClient } from '@floe/sdk';
import { DeepBookModule } from './engine/deepbook-module.ts';
import { StratosStrategy, DEFAULT_PARAMS } from './strategy/stratos.ts';
import { FLOE } from './config.ts';

const floe = new FloeClient({ network: 'testnet' });
const mod = new DeepBookModule(new StratosStrategy(DEFAULT_PARAMS));

console.log(`VenueModule: venue=${mod.venue} name="${mod.name}"`);
console.log(`  ${mod.description}\n`);

// value() — DeepBook's NAV contribution, through the uniform interface
const val = await mod.value(floe, FLOE.vaultId);
console.log(`value() -> $${Number(val.valueRaw)/1e6}`);
console.log(`  parts: plp $${Number(val.parts?.plp ?? 0n)/1e6}, positions $${Number(val.parts?.positions ?? 0n)/1e6}`);
console.log(`\nThis is DeepBook's contribution to the vault's multi-venue NAV, via the uniform VenueModule interface.`);
console.log(`Suilend (Phase 4) implements the SAME value()/decide()/compose() -> NAV sums across both.`);
