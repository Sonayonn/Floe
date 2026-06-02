import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
const sui = new SuiClient({ url: getFullnodeUrl('testnet') });

// The clmm_pools registry holds all pools. From the SDK testnet config:
// clmm_pools_id was '0x26c85500...' (truncated in docs). Let's find pools via events instead.
const CORE = '0x0868b71c0cba55bf0faf6c40df8c179c67a4d0ba0e79965b68b3d72d7dfbf666';

// Query recent pool-creation events from the factory
try {
  const ev = await sui.queryEvents({
    query: { MoveEventModule: { package: CORE, module: 'factory' } },
    limit: 25, order: 'descending',
  });
  console.log(`Found ${ev.data.length} factory events. Pools:`);
  const seen = new Set<string>();
  for (const e of ev.data) {
    const p:any = e.parsedJson;
    const pid = p?.pool_id ?? p?.pool;
    const a = p?.coin_type_a ?? p?.coin_a;
    const b = p?.coin_type_b ?? p?.coin_b;
    if (pid && !seen.has(pid)) {
      seen.add(pid);
      const short = (t:string)=> t ? t.split('::').slice(-1)[0] : '?';
      console.log(`  ${pid}`);
      console.log(`     ${short(a)} / ${short(b)}   (A=${a?.slice(0,20)}… B=${b?.slice(0,20)}…)`);
    }
  }
} catch (e:any) { console.log('factory event query failed:', String(e.message||e).slice(0,80)); }
