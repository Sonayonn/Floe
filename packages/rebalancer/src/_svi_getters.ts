import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const PREDICT = '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138';
const mods = await sui.getNormalizedMoveModulesByPackage({ package: PREDICT });
const m = (mods as any)['oracle'];
const tn = (x:any):string => {
  if (typeof x!=='object'||!x) return JSON.stringify(x);
  if (x.Reference) return 'Ref<'+tn(x.Reference)+'>';
  if (x.MutableReference) return 'MutRef<'+tn(x.MutableReference)+'>';
  if (x.Struct) return x.Struct.module+'::'+x.Struct.name;
  if (x.Vector) return 'vec<'+tn(x.Vector)+'>';
  if (x.TypeParameter!==undefined) return 'T'+x.TypeParameter;
  return JSON.stringify(x).slice(0,20);
};
for (const fn of ['svi_a','svi_b','svi_m','svi_rho','svi_sigma','spot_price','forward_price','svi','compute_price']) {
  const f = m.exposedFunctions[fn];
  if (!f) { console.log(`(no ${fn})`); continue; }
  const params = f.parameters.map(tn).join(', ');
  console.log(`${fn}(${params}) -> ${JSON.stringify(f.return_)}`);
}
// also read the live svi field values + their scale
const o = await sui.getObject({ id:'0xb79524498a9947307e192d8045772150dc47aade4f9e09bd4b6fe3236b9e3125', options:{ showContent:true }});
const svi = (o.data?.content as any)?.fields?.svi;
console.log('\nlive svi field:', JSON.stringify(svi).slice(0,300));
const spot = (o.data?.content as any)?.fields?.prices;
console.log('prices field:', JSON.stringify(spot).slice(0,200));
