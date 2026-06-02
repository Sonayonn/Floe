import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const CORE = '0x0868b71c0cba55bf0faf6c40df8c179c67a4d0ba0e79965b68b3d72d7dfbf666';
for (const [label,id] of [
  ['SDK-published 0xe1f3db32','0xe1f3db327e75f7ec30585fa52241edf66f7e359ef550b533f89aa1528dd1be52'],
  ['probe cand 0x6f4149091a','0x6f4149091a5aea0e818e7243a13adcfb403842d670b9a2089de058512620687a'],
] as const) {
  try {
    const o = await sui.getObject({ id, options:{ showType:true }});
    const t = (o.data as any)?.type ?? (o.error as any)?.code;
    const matches = typeof t === 'string' && t.startsWith(CORE);
    console.log(`${matches?'✓ MATCHES core':'✗ wrong pkg'}  ${label}: ${t}`);
  } catch(e:any){ console.log(`✗ ${label}: ${String(e.message||e).slice(0,40)}`); }
}
