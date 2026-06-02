import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const CORE = '0x0868b71c0cba55bf0faf6c40df8c179c67a4d0ba0e79965b68b3d72d7dfbf666';
const mods = await sui.getNormalizedMoveModulesByPackage({ package: CORE });
const f = (mods as any)['factory'].exposedFunctions['create_pool_with_liquidity'];
f.parameters.forEach((p:any,i:number)=>{
  // extract the module::name of each struct param
  const find = (x:any):string => {
    if (typeof x !== 'object' || !x) return JSON.stringify(x);
    if (x.MutableReference) return 'MutRef<'+find(x.MutableReference)+'>';
    if (x.Reference) return 'Ref<'+find(x.Reference)+'>';
    if (x.Struct) return x.Struct.module+'::'+x.Struct.name+(x.Struct.typeArguments?.length?'<'+x.Struct.typeArguments.map(find).join(',')+'>':'');
    if (x.Vector) return 'vec<'+find(x.Vector)+'>';
    if (x.TypeParameter!==undefined) return 'T'+x.TypeParameter;
    return JSON.stringify(x).slice(0,30);
  };
  console.log(`p${i}: ${find(p)}`);
});
