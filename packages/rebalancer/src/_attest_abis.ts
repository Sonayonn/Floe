import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
const sui = new SuiClient({ url: getFullnodeUrl('testnet') });

// TIER 1: Sui native ed25519 verify (0x2 framework)
console.log('=== TIER 1: 0x2::ed25519 verify ===');
const f = (await sui.getNormalizedMoveModulesByPackage({ package: '0x2' }))['ed25519'];
for (const fn of Object.keys(f.exposedFunctions).filter(x=>/verify/.test(x))) {
  const fdef = f.exposedFunctions[fn];
  console.log(`${fn}: ret=${JSON.stringify(fdef.return_)}`);
  fdef.parameters.forEach((p:any,i:number)=>console.log(`   p${i}: ${JSON.stringify(p).slice(0,70)}`));
}

// TIER 2: Mysten enclave package (from the Nautilus repo: ENCLAVE_PACKAGE_ID example)
console.log('\n=== TIER 2: Mysten enclave package ===');
const ENCLAVE_PKG = '0x3b009f952e11f0fa0612d0a8e07461fb69edc355d732e5d6e39267b1b4fd7138';
try {
  const em = await sui.getNormalizedMoveModulesByPackage({ package: ENCLAVE_PKG });
  for (const m of Object.keys(em)) {
    console.log(`module ${m}: ${Object.keys((em as any)[m].exposedFunctions).join(', ')}`);
    console.log(`  structs: ${Object.keys((em as any)[m].structs ?? {}).join(', ')}`);
  }
} catch(e:any){ console.log('enclave pkg not on testnet at that id:', String(e.message||e).slice(0,50)); }
