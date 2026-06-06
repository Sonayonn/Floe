import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const OUR = '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC';
const PREDICT_MGR = '0x6ea452565c5ef3916c10f899dae0a307beb1d3dda0b59fabc08a7f315a7373ab';
const PREDICT_OBJ = '0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a';

// Read the live Predict manager/object: its quote-asset type IS the canonical dUSDC.
for (const id of [PREDICT_MGR, PREDICT_OBJ]) {
  const o: any = await sui.getObject({ id, options: { showType: true, showContent: true } });
  console.log('\n', id.slice(0,12)+'…');
  console.log('  type:', o.data?.type);
  // pull any dusdc/usdc type arg out of the object type
  const m = (o.data?.type||'').match(/0x[0-9a-f]+::[a-z_]+::[A-Za-z_]+/g) || [];
  const usdcish = m.filter((t:string)=>t.toLowerCase().includes('usdc'));
  if (usdcish.length) console.log('  quote-ish types:', [...new Set(usdcish)]);
}
console.log('\nOUR DUSDC:', OUR);
