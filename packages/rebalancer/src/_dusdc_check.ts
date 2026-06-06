import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const OUR_DUSDC = '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC';
const PREDICT_PKG = '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138';
const m: any = await sui.getNormalizedMoveModulesByPackage({ package: PREDICT_PKG });
const found = new Set<string>();
for (const modName of Object.keys(m)) {
  const fns = m[modName].exposedFunctions || {};
  for (const f of Object.values<any>(fns)) {
    const walk = (t: any) => {
      if (!t) return;
      if (t.Struct) { const s=t.Struct; const tn=`${s.address}::${s.module}::${s.name}`;
        if (tn.toLowerCase().includes('usdc')) found.add(tn);
        (s.typeArguments||[]).forEach(walk); }
      if (t.Reference) walk(t.Reference); if (t.MutableReference) walk(t.MutableReference);
      if (t.Vector) walk(t.Vector);
    };
    (f.parameters||[]).forEach(walk);
  }
}
console.log('USDC-like types Predict references:', [...found]);
console.log('OUR vault DUSDC:                   ', OUR_DUSDC);
console.log('MATCH:', found.has(OUR_DUSDC));
