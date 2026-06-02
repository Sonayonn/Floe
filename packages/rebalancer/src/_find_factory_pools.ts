import { SuiClient } from '@mysten/sui/client';
const sui = new SuiClient({ url: process.env.SUI_RPC_URL! });
const CORE = '0x0868b71c0cba55bf0faf6c40df8c179c67a4d0ba0e79965b68b3d72d7dfbf666';
const txs = await sui.queryTransactionBlocks({
  filter: { InputObject: CORE }, options: { showObjectChanges: true }, limit: 10, order: 'ascending',
});
console.log(`scanning ${txs.data.length} early core-pkg txs for factory::Pools...`);
for (const t of txs.data) {
  for (const c of (t.objectChanges ?? []) as any[]) {
    if (c.type === 'created' && /factory::Pools/.test(c.objectType || '')) {
      const shared = c.owner?.Shared ? `shared@${c.owner.Shared.initial_shared_version}` : 'owned';
      console.log(`  FOUND factory::Pools: ${c.objectId} (${shared})`);
    }
  }
}
