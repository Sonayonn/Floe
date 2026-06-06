import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const PREDICT_PKG = '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138';
const m: any = await sui.getNormalizedMoveModulesByPackage({ package: PREDICT_PKG });
// MarketKey + RangeKey struct shape, and how you construct them (public constructors?)
for (const mod of ['market_key','range_key']) {
  console.log(`\n=== ${mod} module ===`);
  const sm = m[mod]?.structs || {};
  for (const [sn, sd] of Object.entries<any>(sm)) {
    console.log(`struct ${sn}: fields = ${(sd.fields||[]).map((f:any)=>`${f.name}:${JSON.stringify(f.type)}`).join(', ')}`);
  }
  const fns = m[mod]?.exposedFunctions || {};
  for (const [fn, f] of Object.entries<any>(fns)) {
    if (f.visibility === 'Public' || f.isEntry) console.log(`  fn ${fn} [${f.visibility}] returns ${JSON.stringify(f.return||[])}`);
  }
}
