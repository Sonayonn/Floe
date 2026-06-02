import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const CORE = '0x0868b71c0cba55bf0faf6c40df8c179c67a4d0ba0e79965b68b3d72d7dfbf666';
const mods = await sui.getNormalizedMoveModulesByPackage({ package: CORE });

for (const m of ['factory','pool_creator']) {
  const mod = (mods as any)[m];
  if (!mod) { console.log(`(no module ${m})`); continue; }
  const fns = Object.keys(mod.exposedFunctions);
  console.log(`\n=== ${m} fns: ${fns.join(', ')}`);
  for (const fn of fns.filter(f=>/create|pool/.test(f))) {
    const f = mod.exposedFunctions[fn];
    console.log(`\n  ${fn} [${f.visibility}] ret=${JSON.stringify(f.return_)?.slice(0,80)}`);
    f.parameters.forEach((p:any,i:number)=>{
      const s = JSON.stringify(p);
      console.log(`    p${i}: ${s.length>90?s.slice(0,90)+'…':s}`);
    });
  }
}
