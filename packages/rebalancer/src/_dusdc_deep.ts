import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const OUR = '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC';
const PREDICT_PKG = '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138';

// 1) Look at the full content of the Predict object — find any dusdc/Balance type in its fields
const obj: any = await sui.getObject({ id: '0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a', options: { showContent: true } });
const blob = JSON.stringify(obj.data?.content ?? {});
const types = [...new Set((blob.match(/0x[0-9a-f]{6,}::[a-z_]+::[A-Za-z_]+/g) || []))];
console.log('types inside Predict object:', types.filter(t => t.toLowerCase().includes('usdc') || t.toLowerCase().includes('coin') || t.toLowerCase().includes('balance')).slice(0,10));

// 2) Find the function that supplies/mints and read its quote type param (the canonical dUSDC)
const m: any = await sui.getNormalizedMoveModule({ package: PREDICT_PKG, module: 'predict' });
const supply = m.exposedFunctions['supply'] || m.exposedFunctions['mint'];
console.log('\nsupply/mint type params:', JSON.stringify(m.exposedFunctions['supply']?.typeParameters ?? 'no supply'));
console.log('supply params:', JSON.stringify(m.exposedFunctions['supply']?.parameters ?? []).slice(0,400));

console.log('\nOUR DUSDC:', OUR);
