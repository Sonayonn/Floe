import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const CORE = '0x0868b71c0cba55bf0faf6c40df8c179c67a4d0ba0e79965b68b3d72d7dfbf666';
const mods = await sui.getNormalizedMoveModulesByPackage({ package: CORE });
console.log('Cetus CORE modules:', Object.keys(mods).join(', '));
const pool = (mods as any)['pool'];
if (pool) {
  const fns = Object.keys(pool.exposedFunctions);
  console.log('\npool fns (liquidity/position/swap):',
    fns.filter(f => /liquid|position|swap|open|close|collect/.test(f)).join(', '));
  // signatures for the ones we need
  for (const fn of ['open_position','add_liquidity','add_liquidity_fix_coin','remove_liquidity','close_position','collect_fee']) {
    const f = pool.exposedFunctions[fn];
    if (f) console.log(`\n${fn}: ${f.parameters.length} params, visibility=${f.visibility}`);
  }
}
const pos = (mods as any)['position'];
if (pos) {
  const fns = Object.keys(pos.exposedFunctions);
  console.log('\nposition fns:', fns.filter(f => /liquid|value|amount|info/.test(f)).slice(0,12).join(', '));
}
