import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const COIN='0x26b3bc67befc214058ca78ea9a2690298d731a2d4309485ec3d40198063c4abc';

// Shared objects can be found via queryTransactionBlocks filtered to the package's
// publish is history-dependent (fails). Instead: the Limiter/Supply are shared singletons.
// Try the InitEvent — query events by EMITTER (the package) using queryEvents with
// a TIME filter avoids the specific pruned tx. Actually simplest: many Cetus test coin
// faucets store Supply as a shared object whose id we can get from getOwnedObjects of
// NOBODY — so use suix_queryObjects is unavailable. 
// FINAL approach: read faucet_amount (a view) is irrelevant. 
// Use the Sui indexer RPC suix_ to get objects by type:
try {
  // @ts-ignore - call raw rpc
  const res:any = await (sui as any).transport.request({
    method: 'suix_getOwnedObjects', params: [COIN, {}],
  });
  console.log('owned by pkg (unlikely):', JSON.stringify(res).slice(0,200));
} catch(e:any){ console.log('owned probe:', String(e.message||e).slice(0,60)); }

// The reliable history-free method: getDynamicFields won't help.
// Just try the two most likely: read the coin module's InitEvent via queryEvents w/ MoveEventType
for (const m of ['usdc','eth']) {
  try {
    const ev = await sui.queryEvents({ query:{ MoveEventType: `${COIN}::${m}::InitEvent` }, limit:1, order:'ascending' });
    console.log(`${m} InitEvent:`, ev.data.length ? JSON.stringify(ev.data[0].parsedJson) : '(none)');
  } catch(e:any){ console.log(`${m} InitEvent: ${String(e.message||e).slice(0,40)}`); }
}
