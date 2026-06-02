import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const POOL2 = '0x74dcb8625ddd023e2ef7faf1ae299e3bc4cb4c337d991a5326751034676acdae';
const o = await sui.getObject({ id: POOL2, options:{ showType:true, showContent:true }});
console.log('type:', (o.data as any)?.type);
const f:any = (o.data?.content as any)?.fields ?? {};
console.log('  sqrt_price:', f.current_sqrt_price, ' tick:', JSON.stringify(f.current_tick_index));
console.log('  liquidity:', f.liquidity, ' tick_spacing:', f.tick_spacing, ' paused:', f.is_pause);
console.log('  coin_a bal:', f.coin_a, ' coin_b bal:', f.coin_b, ' fee_rate:', f.fee_rate);

// also probe the faucet Supply object IDs we'll need to mint usdc/usdt
const COIN='0x26b3bc67befc214058ca78ea9a2690298d731a2d4309485ec3d40198063c4abc';
console.log('\nFinding faucet Supply shared objects (usdc, usdt)...');
for (const mod of ['usdc','usdt']) {
  try {
    const ev = await sui.queryEvents({ query:{ MoveEventModule:{ package: COIN, module: mod }}, limit:1 });
    console.log(`  ${mod}: (event probe) ${ev.data.length} events`);
  } catch(e:any){ console.log(`  ${mod}: event probe failed (pruned tx) — will find Supply another way`); }
}
