import { SuiClient } from '@mysten/sui/client';
const sui = new SuiClient({ url: process.env.SUI_RPC_URL! });
const ENCLAVE = '0x3b009f952e11f0fa0612d0a8e07461fb69edc355d732e5d6e39267b1b4fd7138';
const mods = await sui.getNormalizedMoveModulesByPackage({ package: ENCLAVE });
const m = (mods as any)['enclave'];
const tname = (x:any):string => {
  if (typeof x!=='object'||!x) return JSON.stringify(x);
  if (x.MutableReference) return 'MutRef<'+tname(x.MutableReference)+'>';
  if (x.Reference) return 'Ref<'+tname(x.Reference)+'>';
  if (x.Struct) return x.Struct.module+'::'+x.Struct.name+(x.Struct.typeArguments?.length?'<'+x.Struct.typeArguments.map(tname).join(',')+'>':'');
  if (x.Vector) return 'vec<'+tname(x.Vector)+'>';
  if (x.TypeParameter!==undefined) return 'T'+x.TypeParameter;
  return JSON.stringify(x).slice(0,25);
};
for (const fn of ['register_enclave','verify_signature','pk','create_enclave_config','update_pcrs','new_cap']) {
  const f = m.exposedFunctions[fn];
  if (!f) { console.log(`(no ${fn})`); continue; }
  console.log(`\n=== ${fn} [${f.visibility}] tparams=${f.typeParameters?.length??0} ret=${JSON.stringify(f.return_)?.slice(0,60)}`);
  f.parameters.forEach((p:any,i:number)=>console.log(`   p${i}: ${tname(p)}`));
}
console.log('\n=== Enclave struct ===');
console.log(JSON.stringify((m.structs?.Enclave)??{}, null, 0).slice(0,300));
