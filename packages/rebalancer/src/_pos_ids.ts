import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
const s = new SuiClient({ url: getFullnodeUrl('testnet') });
const d = await s.getDynamicFields({ parentId: '0x8cdda18ada434e5551174e36dcb4c6ddf7819161e65971920ef307fa571b3e91' });
console.log(JSON.stringify(d.data.map(x => x.name?.value), null, 2));
