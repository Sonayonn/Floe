import { SuiClient } from '@mysten/sui/client';
const sui = new SuiClient({ url: process.env.SUI_RPC_URL! });
const ORIG = '0x0868b71c0cba55bf0faf6c40df8c179c67a4d0ba0e79965b68b3d72d7dfbf666';

// For a known-successful open_position tx, list ALL object inputs + which is GlobalConfig.
const tx = await sui.getTransactionBlock({ digest: '7tkwvuq3Vf', options:{ showInput:true }}).catch(()=>null)
  || (await sui.queryTransactionBlocks({ filter:{ MoveFunction:{ package:ORIG, module:'pool', function:'open_position' }}, options:{ showInput:true }, limit:1, order:'descending' })).data[0];

const inputs = (tx as any).transaction?.data?.transaction?.inputs ?? [];
console.log('object inputs in successful open_position:');
for (const i of inputs) {
  if (i.type==='object' && i.objectId) {
    const o = await sui.getObject({ id: i.objectId, options:{ showType:true }});
    const t = (o.data as any)?.type ?? '';
    if (/GlobalConfig/.test(t)) console.log('  GlobalConfig used:', i.objectId);
  }
}

// read OUR config's package_version vs what's expected
const gc = await sui.getObject({ id:'0x6f4149091a5aea0e818e7243a13adcfb403842d670b9a2089de058512620687a', options:{ showContent:true }});
console.log('\nour config 0x6f414909 package_version:', (gc.data?.content as any)?.fields?.package_version);

// Also: maybe there's a NEWER GlobalConfig. Check the other one we saw earlier.
const gc2 = await sui.getObject({ id:'0x9774e359588ead122af1c7e7f64e14ade261cfeecdb5d0eb4a5b3b4c8ab8bd3e', options:{ showContent:true, showType:true }}).catch(()=>null);
if (gc2?.data) console.log('alt config 0x9774e359:', (gc2.data as any).type?.slice(0,50), 'ver:', (gc2.data.content as any)?.fields?.package_version);
