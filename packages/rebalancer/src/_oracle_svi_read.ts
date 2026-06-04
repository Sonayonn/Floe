import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const ORACLE = '0xb79524498a9947307e192d8045772150dc47aade4f9e09bd4b6fe3236b9e3125';

// 1) What IS this oracle object? Its type + fields (the SVI surface params).
const o = await sui.getObject({ id: ORACLE, options:{ showType:true, showContent:true }});
console.log('type:', (o.data as any)?.type);
const f:any = (o.data?.content as any)?.fields ?? {};
console.log('fields:', Object.keys(f).join(', '));
// print the SVI-relevant fields (vol surface params: a, b, rho, m, sigma, or spot/forward/iv)
for (const k of Object.keys(f)) {
  const v = f[k];
  const show = typeof v === 'object' ? JSON.stringify(v).slice(0,80) : String(v).slice(0,60);
  console.log(`  ${k}: ${show}`);
}

// 2) Does the Predict package expose a public fun to READ implied vol from the oracle?
const PREDICT = '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138';
const mods = await sui.getNormalizedMoveModulesByPackage({ package: PREDICT }).catch(()=>null);
if (mods) {
  for (const m of Object.keys(mods as any)) {
    const fns = Object.keys((mods as any)[m].exposedFunctions).filter(fn=>/vol|iv|implied|svi|sigma|price|mark/i.test(fn));
    if (fns.length) console.log(`module ${m}: ${fns.join(', ')}`);
  }
}
