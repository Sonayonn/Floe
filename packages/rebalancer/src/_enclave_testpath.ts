import { SuiClient } from '@mysten/sui/client';
const sui = new SuiClient({ url: process.env.SUI_RPC_URL! });
const ENCLAVE = '0x3b009f952e11f0fa0612d0a8e07461fb69edc355d732e5d6e39267b1b4fd7138';
const mods = await sui.getNormalizedMoveModulesByPackage({ package: ENCLAVE });
const m = (mods as any)['enclave'];
const tname = (x:any):string => {
  if (typeof x!=='object'||!x) return JSON.stringify(x);
  if (x.MutableReference) return 'MutRef<'+tname(x.MutableReference)+'>';
  if (x.Reference) return 'Ref<'+tname(x.Reference)+'>';
  if (x.Struct) return x.Struct.module+'::'+x.Struct.name;
  if (x.Vector) return 'vec<'+tname(x.Vector)+'>';
  if (x.TypeParameter!==undefined) return 'T'+x.TypeParameter;
  return JSON.stringify(x).slice(0,25);
};
// the owner/test path to make an Enclave without a full Nitro doc
for (const fn of ['deploy_old_enclave_by_owner','destroy_old_enclave']) {
  const f = m.exposedFunctions[fn];
  if (!f) { console.log(`(no ${fn})`); continue; }
  console.log(`=== ${fn} [${f.visibility}] tparams=${f.typeParameters?.length} ret=${JSON.stringify(f.return_)?.slice(0,40)}`);
  f.parameters.forEach((p:any,i:number)=>console.log(`   p${i}: ${tname(p)}`));
}
// full Enclave struct fields
console.log('\nEnclave fields:', (m.structs.Enclave.fields as any[]).map(f=>f.name).join(', '));
// is verify_signature callable with our own payload type? check IntentMessage
console.log('IntentMessage fields:', (m.structs.IntentMessage?.fields as any[])?.map(f=>f.name).join(', ') ?? 'n/a');
