import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const PREDICT_PKG = '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138';
const m: any = await sui.getNormalizedMoveModulesByPackage({ package: PREDICT_PKG });

// find every fn whose name mentions redeem / settle / withdraw
for (const modName of Object.keys(m)) {
  const fns = m[modName].exposedFunctions || {};
  for (const [fname, f] of Object.entries<any>(fns)) {
    if (/redeem|settle|withdraw|claim/i.test(fname)) {
      console.log(`\n${modName}::${fname}`);
      console.log('  visibility:', f.visibility, '| entry:', f.isEntry);
      console.log('  typeParams:', (f.typeParameters||[]).length);
      console.log('  params:', JSON.stringify(f.parameters));
      console.log('  returns:', JSON.stringify(f.return ?? f.returns ?? []));
    }
  }
}
