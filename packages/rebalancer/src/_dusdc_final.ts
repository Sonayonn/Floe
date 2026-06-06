import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const OUR = '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC';
const PREDICT_OBJ = '0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a';

// The dUSDC balance lives in the Predict object's dynamic fields. Walk them; any
// Balance<...>/Coin<...> child reveals the quote type the live market actually uses.
const dfs = await sui.getDynamicFields({ parentId: PREDICT_OBJ });
console.log('Predict dynamic fields:', dfs.data.length);
const found = new Set<string>();
for (const d of dfs.data) {
  const tn = JSON.stringify(d.name) + ' ' + (d.objectType ?? '');
  const m = tn.match(/0x[0-9a-f]{6,}::[a-z_]+::[A-Za-z_]+/g) || [];
  m.filter(t => t.toLowerCase().includes('usdc')).forEach(t => found.add(t));
}
console.log('dUSDC type(s) the live Predict market holds:', [...found]);
console.log('OUR:', OUR);
console.log('MATCH:', found.has(OUR) || found.size === 0 ? (found.has(OUR) ? 'YES — provably canonical' : 'inconclusive (balance nested deeper)') : 'NO — different dUSDC');
