import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const o = await sui.getObject({ id:'0xb79524498a9947307e192d8045772150dc47aade4f9e09bd4b6fe3236b9e3125', options:{ showContent:true }});
const f:any = (o.data?.content as any)?.fields;
const svi = f.svi.fields;
const i64 = (x:any)=> x.fields ? (x.fields.is_negative ? '-' : '') + x.fields.magnitude : x;
console.log('SVI params (raw):');
console.log('  a    =', svi.a);
console.log('  b    =', svi.b);
console.log('  m    =', i64(svi.m));
console.log('  rho  =', i64(svi.rho));
console.log('  sigma=', i64(svi.sigma));
console.log('spot   =', f.prices.fields.spot);
console.log('forward=', f.prices.fields.forward);
console.log('expiry =', f.expiry, ' now~', Date.now(), ' TTE_ms=', Number(f.expiry)-Date.now());
console.log('timestamp=', f.timestamp);
// the i64 getters' return types
const PREDICT = '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138';
const mods = await sui.getNormalizedMoveModulesByPackage({ package: PREDICT });
const m = (mods as any)['oracle'];
for (const fn of ['svi_m','svi_rho','svi_sigma','svi_a','expiry','timestamp']) {
  const fdef = m.exposedFunctions[fn];
  if (fdef) console.log(`ret ${fn}:`, JSON.stringify(fdef.return_));
}
// check i64 module API for reading magnitude/sign in Move
const i64m = (mods as any)['i64'];
console.log('i64 fns:', Object.keys(i64m.exposedFunctions).join(', '));
