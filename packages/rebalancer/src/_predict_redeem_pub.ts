import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const PREDICT_PKG = '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138';
const m: any = await sui.getNormalizedMoveModulesByPackage({ package: PREDICT_PKG });

// ONLY public/entry redeem|mint|supply fns in the `predict` module (the ones we can actually call)
const pm = m['predict']?.exposedFunctions || {};
console.log('=== predict module: callable (Public/entry) redeem|mint|supply|withdraw fns ===');
for (const [fname, f] of Object.entries<any>(pm)) {
  if (/redeem|mint|supply|withdraw/i.test(fname) && (f.visibility === 'Public' || f.isEntry)) {
    console.log(`\npredict::${fname}  [${f.visibility}${f.isEntry?' entry':''}]  typeParams:${(f.typeParameters||[]).length}`);
    const simplify = (p:any):string => {
      if (typeof p === 'string') return p;
      if (p.Reference) return '&'+simplify(p.Reference);
      if (p.MutableReference) return '&mut '+simplify(p.MutableReference);
      if (p.Struct) return p.Struct.module+'::'+p.Struct.name + (p.Struct.typeArguments?.length?`<${p.Struct.typeArguments.map(simplify).join(',')}>`:'');
      if (p.Vector) return 'vector<'+simplify(p.Vector)+'>';
      if (p.TypeParameter!==undefined) return 'T'+p.TypeParameter;
      return JSON.stringify(p);
    };
    console.log('  params: ', (f.parameters||[]).map(simplify).join(', '));
    console.log('  returns:', (f.return||[]).map(simplify).join(', ') || '()');
  }
}
