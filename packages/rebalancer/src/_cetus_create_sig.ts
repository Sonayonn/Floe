import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const CORE = '0x0868b71c0cba55bf0faf6c40df8c179c67a4d0ba0e79965b68b3d72d7dfbf666';
const mods = await sui.getNormalizedMoveModulesByPackage({ package: CORE });
const f = (mods as any)['factory'].exposedFunctions['create_pool_with_liquidity'];
console.log('return:', JSON.stringify(f.return_));
console.log('type params:', JSON.stringify(f.typeParameters));
// also need DUSDC type string + SUI ordering. DUSDC:
console.log('\nDUSDC type: 0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC');
console.log('SUI type:   0x2::sui::SUI');
// Cetus orders coins by type-string bytes; check which is "A"
const dusdc = '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC';
const sui_t = '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI';
console.log('\nordering (A<B by string):', dusdc < sui_t ? 'DUSDC=A, SUI=B' : 'SUI=A, DUSDC=B');
