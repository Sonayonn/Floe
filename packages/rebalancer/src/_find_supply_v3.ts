import { SuiClient } from '@mysten/sui/client';
const sui = new SuiClient({ url: process.env.SUI_RPC_URL! });
const COIN = '0x26b3bc67befc214058ca78ea9a2690298d731a2d4309485ec3d40198063c4abc';

// Approach: query all transactions touching the coin package, find the one that
// created the Supply/Limiter shared objects (the init-setup tx after publish).
const txs = await sui.queryTransactionBlocks({
  filter: { InputObject: COIN },
  options: { showObjectChanges: true },
  limit: 10, order: 'ascending',
});
console.log(`scanning ${txs.data.length} early txs touching the coin pkg...`);
const found: Record<string,string> = {};
for (const t of txs.data) {
  for (const c of (t.objectChanges ?? []) as any[]) {
    if (c.type === 'created' && /Supply/.test(c.objectType || '')) {
      const sym = c.objectType.split('::').slice(-1)[0];
      if (!found[sym]) {
        found[sym] = c.objectId;
        const shared = c.owner?.Shared ? `shared@${c.owner.Shared.initial_shared_version}` : 'owned';
        console.log(`  ${sym}: ${c.objectId} (${shared})`);
      }
    }
  }
}
if (!Object.keys(found).length) {
  console.log('no Supply in InputObject txs — trying ChangedObject filter...');
  const txs2 = await sui.queryTransactionBlocks({
    filter: { ChangedObject: COIN }, options: { showObjectChanges: true }, limit: 5, order: 'ascending',
  });
  console.log(`(${txs2.data.length} ChangedObject txs)`);
}
