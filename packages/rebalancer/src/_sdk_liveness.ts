import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { FLOE_ADDRESSES } from '@floe/sdk';
const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const a = FLOE_ADDRESSES.testnet;
async function fns(pkg: string, mod: string) {
  const m: any = await sui.getNormalizedMoveModule({ package: pkg, module: mod });
  return Object.keys(m.exposedFunctions);
}
const core = await fns(a.package, a.module);
const must = ['request_redeem_shares','fulfill_redeems','claim_redeem','available_idle','settle_position','deposit','withdraw'];
console.log('core package:', a.package);
for (const f of must) console.log(`  ${must.includes(f) && core.includes(f) ? '✓' : '✗ MISSING'} ${f}`);
console.log('FLOE_VERSION:', (await import('@floe/sdk')).FLOE_VERSION);
