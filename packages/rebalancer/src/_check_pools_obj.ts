import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const CORE = '0x0868b71c0cba55bf0faf6c40df8c179c67a4d0ba0e79965b68b3d72d7dfbf666';

// what is 0x26c85500?
const reg = await sui.getObject({ id: '0x26c85500f5dd2983bf35123918a144de24e18936d0b234ef2b49fbb2d3d6307d', options:{ showType:true, showOwner:true }});
console.log('0x26c85500 type:', (reg.data as any)?.type);
console.log('0x26c85500 owner:', JSON.stringify((reg.data as any)?.owner));

// what type does the function ACTUALLY want for p0?
const mods = await sui.getNormalizedMoveModulesByPackage({ package: CORE });
const f = (mods as any)['factory'].exposedFunctions['create_pool_with_liquidity'];
console.log('\nfunction wants p0:', JSON.stringify(f.parameters[0]));

// also: is there a Pools object of type factory::Pools we should use instead?
// the GlobalConfig we verified earlier:
const gc = await sui.getObject({ id: '0x6f4149091a5aea0e818e7243a13adcfb403842d670b9a2089de058512620687a', options:{ showType:true, showOwner:true }});
console.log('\nGlobalConfig 0x6f414909 type:', (gc.data as any)?.type);
console.log('GlobalConfig owner:', JSON.stringify((gc.data as any)?.owner));
