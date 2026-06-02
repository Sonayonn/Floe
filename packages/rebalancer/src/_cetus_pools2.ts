import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const short = (t?:string)=> t ? t.split('::').slice(-1)[0] : '?';

// Approach 1: the known live pool's position_manager/tick refs won't list siblings,
// so go to the Pools registry. From SDK testnet config the clmm global config object
// and pools handle live under the config pkg 0xf5ff7d5b. Try the documented pools id.
const CANDIDATES = [
  '0x26c85500f5dd2983bf35123918a144de24e18936d0b234ef2b49fb', // truncated in docs — likely invalid, will fail cleanly
];
for (const id of CANDIDATES) {
  try {
    const o = await sui.getObject({ id, options:{ showContent:true, showType:true }});
    console.log('candidate', id, '→', (o.data as any)?.type ?? o.error);
  } catch(e:any){ console.log('candidate', id, 'err', String(e.message||e).slice(0,50)); }
}

// Approach 2 (reliable): list pools by querying the factory's CreatePoolEvent via event TYPE
// (not module), which avoids the pruned-tx path.
try {
  const CORE = '0x0868b71c0cba55bf0faf6c40df8c179c67a4d0ba0e79965b68b3d72d7dfbf666';
  const ev = await sui.queryEvents({
    query: { MoveEventType: `${CORE}::factory::CreatePoolEvent` },
    limit: 30, order: 'descending',
  });
  console.log(`\n${ev.data.length} CreatePoolEvent(s):`);
  const seen = new Set<string>();
  for (const e of ev.data) {
    const p:any = e.parsedJson;
    const pid = p?.pool_id ?? p?.pool;
    if (pid && !seen.has(pid)) { seen.add(pid);
      console.log(`  ${pid}  ${short(p?.coin_type_a)}/${short(p?.coin_type_b)}`);
    }
  }
} catch(e:any){ console.log('\nMoveEventType query failed:', String(e.message||e).slice(0,80)); }
