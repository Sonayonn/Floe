import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const POOLS_REGISTRY = '0x26c85500f5dd2983bf35123918a144de24e18936d0b234ef2b49fbb2d3d6307d';
const short = (t?:string)=> t ? t.split('::').slice(-1)[0] : '?';

// The registry holds pools as dynamic fields. List them.
let cursor: string | null | undefined = undefined;
let count = 0;
const pools: {id:string,a:string,b:string}[] = [];
do {
  const page = await sui.getDynamicFields({ parentId: POOLS_REGISTRY, cursor, limit: 50 });
  for (const df of page.data) {
    // each dynamic field points to a pool entry; fetch its value
    try {
      const o = await sui.getDynamicFieldObject({ parentId: POOLS_REGISTRY, name: df.name });
      const f:any = (o.data?.content as any)?.fields ?? {};
      // the entry usually carries pool_id + coin types
      const pid = f.value?.fields?.pool_id ?? f.pool_id ?? f.value;
      const a = f.value?.fields?.coin_type_a ?? f.coin_type_a;
      const b = f.value?.fields?.coin_type_b ?? f.coin_type_b;
      if (pid) pools.push({ id: typeof pid==='string'?pid:JSON.stringify(pid), a, b });
    } catch {}
    count++;
  }
  cursor = page.hasNextPage ? page.nextCursor : null;
} while (cursor && count < 100);

console.log(`Scanned ${count} registry entries, ${pools.length} pools with coin info:`);
for (const p of pools.slice(0, 40)) {
  console.log(`  ${String(p.id).slice(0,20)}…  ${short(p.a)}/${short(p.b)}`);
}
