import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
const sui = new SuiClient({ url: getFullnodeUrl('testnet') });

// The live testnet pool we found earlier
const POOL = '0xbed3136f15b0ea649fb94bcdf9d3728fb82ba1c3e189bf6062d78ff547850054';
const o = await sui.getObject({ id: POOL, options: { showContent: true, showType: true } });
console.log('Pool type:', (o.data as any)?.type);
const f = (o.data?.content as any)?.fields ?? {};
console.log('Pool fields:', Object.keys(f).join(', '));
console.log('  current_sqrt_price:', f.current_sqrt_price);
console.log('  current_tick_index:', JSON.stringify(f.current_tick_index));
console.log('  liquidity:', f.liquidity);
console.log('  tick_spacing:', f.tick_spacing);
console.log('  is_pause:', f.is_pause);
console.log('  coin A balance:', f.coin_a, ' coin B balance:', f.coin_b);

// The GlobalConfig object id — find it from the config package's shared objects.
// The clmm config package is 0xf5ff7d5b... ; GlobalConfig is a shared object under the CORE pkg.
// Search recent: query the core pkg's config module — but easiest: it's referenced in pool events.
// We'll grab it from the SDK testnet config: global_config_id was in the docs dump.
console.log('\nNote: GlobalConfig id to confirm — from SDK testnet config dump.');
