import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const COIN_PKG = '0x26b3bc67befc214058ca78ea9a2690298d731a2d4309485ec3d40198063c4abc';
const mods = await sui.getNormalizedMoveModulesByPackage({ package: COIN_PKG });
console.log('coin pkg modules:', Object.keys(mods).join(', '));
for (const m of Object.keys(mods)) {
  const fns = Object.keys((mods as any)[m].exposedFunctions);
  const faucetish = fns.filter(f => /faucet|mint|claim|get|free/.test(f.toLowerCase()));
  if (faucetish.length) {
    console.log(`  ${m}: ${faucetish.join(', ')}`);
    // show signature of the first faucet-like fn
    const fn = faucetish[0];
    const f = (mods as any)[m].exposedFunctions[fn];
    console.log(`     ${fn} params:`, JSON.stringify(f.parameters));
  }
}
// also check if there's a shared faucet/treasury object pattern
console.log('\nAlso checking for a shared Faucet object via events...');
