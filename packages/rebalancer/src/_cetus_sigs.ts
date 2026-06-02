import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const CORE = '0x0868b71c0cba55bf0faf6c40df8c179c67a4d0ba0e79965b68b3d72d7dfbf666';
const mods = await sui.getNormalizedMoveModulesByPackage({ package: CORE });
const pool = (mods as any)['pool'];
const pos = (mods as any)['position'];

function sig(mod:any, name:string) {
  const f = mod.exposedFunctions[name];
  if (!f) { console.log(`  (no ${name})`); return; }
  console.log(`\n=== ${name} [${f.visibility}] ret=${JSON.stringify(f.return_)}`);
  f.parameters.forEach((p:any,i:number)=>console.log(`  p${i}: ${JSON.stringify(p)}`));
}
for (const fn of ['open_position','add_liquidity_fix_coin','add_liquidity','remove_liquidity','close_position','collect_fee','liquidity','get_amount_by_liquidity']) sig(pool, fn);
console.log('\n--- position module ---');
for (const fn of ['info_liquidity','info_tick_range','liquidity']) sig(pos, fn);
