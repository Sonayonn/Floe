import { SuiClient } from '@mysten/sui/client';
const sui = new SuiClient({ url: process.env.SUI_RPC_URL! });

// Compare our target pool vs the pool that worked in a real tx.
for (const [label, id] of [
  ['OUR pool 0xbed3136f', '0xbed3136f15b0ea649fb94bcdf9d3728fb82ba1c3e189bf6062d78ff547850054'],
  ['WORKING pool 0x17fd50d3', '0x17fd50d35d'],  // partial — need full; we'll resolve from the tx
] as const) {
  try {
    const o = await sui.getObject({ id, options:{ showContent:true, showType:true, showPreviousTransaction:true }});
    const t = (o.data as any)?.type ?? (o.error as any)?.code;
    console.log(`${label}: ${typeof t==='string'? t.slice(0,80):t}`);
  } catch(e:any){ console.log(`${label}: ${String(e.message||e).slice(0,40)}`); }
}

// Get the FULL working-pool id from that successful tx + find a USDT/CETUS pool under v7.
const ORIG = '0x0868b71c0cba55bf0faf6c40df8c179c67a4d0ba0e79965b68b3d72d7dfbf666';
const txs = await sui.queryTransactionBlocks({
  filter: { MoveFunction: { package: ORIG, module: 'pool', function: 'open_position' } },
  options: { showInput: true, showEffects: true }, limit: 5, order: 'descending',
});
console.log('\nrecent successful open_position pools:');
for (const tx of txs.data as any[]) {
  if (tx.effects?.status?.status !== 'success') continue;
  const inputs = tx.transaction?.data?.transaction?.inputs ?? [];
  for (const i of inputs) {
    if (i.type==='object' && i.objectId) {
      const o = await sui.getObject({ id: i.objectId, options:{ showType:true }});
      const t = (o.data as any)?.type ?? '';
      if (/pool::Pool</.test(t)) {
        const pair = t.match(/Pool<([^>]+)>/)?.[1]?.split(',').map((s:string)=>s.split('::').pop()).join('/');
        console.log(`  ${i.objectId} : ${pair}`);
      }
    }
  }
}
