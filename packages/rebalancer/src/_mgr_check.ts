import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const MGR = '0x6ea452565c5ef3916c10f899dae0a307beb1d3dda0b59fabc08a7f315a7373ab';
const o: any = await sui.getObject({ id: MGR, options: { showOwner: true, showType: true } });
console.log('PredictManager owner:', JSON.stringify(o.data?.owner));
console.log('type:', o.data?.type);
