import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const CORE = '0x0868b71c0cba55bf0faf6c40df8c179c67a4d0ba0e79965b68b3d72d7dfbf666';
const mods = await sui.getNormalizedMoveModulesByPackage({ package: CORE });
const pool = (mods as any)['pool'];
function sig(name:string){
  const f = pool.exposedFunctions[name];
  if(!f){console.log(`(no ${name})`);return;}
  console.log(`\n=== ${name} ret=${JSON.stringify(f.return_)}`);
  f.parameters.forEach((p:any,i:number)=>console.log(`  p${i}: ${JSON.stringify(p)}`));
}
sig('repay_add_liquidity');
sig('add_liquidity_fix_coin');
sig('add_liquidity_pay_amount');
// what does open_position return exactly
sig('open_position');
