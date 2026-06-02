import { SuiClient } from '@mysten/sui/client';
const sui = new SuiClient({ url: process.env.SUI_RPC_URL! });
const POOL = '0x17fd50d35d1c2de65c37d2c9745a79de34433e43742f176f91bca580362e8b98';
const o = await sui.getObject({ id: POOL, options:{ showType:true, showContent:true }});
console.log('type:', (o.data as any)?.type);
const f:any = (o.data?.content as any)?.fields ?? {};
const bits = Number(f.current_tick_index?.fields?.bits ?? 0);
const tick = bits >= 0x80000000 ? bits-0x100000000 : bits;
console.log('curTick:', tick, 'tick_spacing:', f.tick_spacing, 'sqrt_price:', f.current_sqrt_price, 'paused:', f.is_pause);
// confirm eth faucet supply id (same method as before)
const COIN='0x26b3bc67befc214058ca78ea9a2690298d731a2d4309485ec3d40198063c4abc';
const txs = await sui.queryTransactionBlocks({
  filter:{ MoveFunction:{ package: COIN, module:'eth', function:'faucet' }},
  options:{ showInput:true }, limit:1, order:'descending',
});
if (txs.data.length) {
  const inputs = (txs.data[0] as any).transaction?.data?.transaction?.inputs ?? [];
  for (const i of inputs) if (i.type==='object'&&i.objectId) console.log('eth Supply:', i.objectId);
}
