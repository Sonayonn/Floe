import { SuiClient } from '@mysten/sui/client';
const sui = new SuiClient({ url: process.env.SUI_RPC_URL! });
const ORIG = '0x0868b71c0cba55bf0faf6c40df8c179c67a4d0ba0e79965b68b3d72d7dfbf666';

// Look at a recent SUCCESSFUL open_position call — which GlobalConfig object did it pass?
const txs = await sui.queryTransactionBlocks({
  filter: { MoveFunction: { package: ORIG, module: 'pool', function: 'open_position' } },
  options: { showInput: true, showEffects: true }, limit: 5, order: 'descending',
});
for (const tx of txs.data as any[]) {
  if (tx.effects?.status?.status !== 'success') continue;
  const inputs = tx.transaction?.data?.transaction?.inputs ?? [];
  const objIds = inputs.filter((i:any)=>i.type==='object').map((i:any)=>i.objectId);
  console.log(`tx ${tx.digest.slice(0,10)} success. object inputs:`);
  for (const id of objIds.slice(0,4)) {
    const o = await sui.getObject({ id, options:{ showType:true }});
    const t = (o.data as any)?.type ?? '';
    if (/GlobalConfig|pool::Pool/.test(t)) console.log(`    ${id.slice(0,12)}.. : ${t.split('::').slice(1).join('::').slice(0,40)}`);
  }
  break; // first successful one is enough
}
