import { SuiClient } from '@mysten/sui/client';
const url = process.env.SUI_RPC_URL!;
const sui = new SuiClient({ url });
console.log('testing RPC:', url.slice(0, 50) + '...');
try {
  const tx = await sui.getTransactionBlock({
    digest: '4bC6Ux9eSzwtBcHd6L8DxMQTx1aqVUv4rNgzhjwaGWFq',
    options: { showObjectChanges: true },
  });
  console.log('✓ FULL HISTORY: resolved the publish tx the public node could not');
  for (const c of (tx.objectChanges ?? []) as any[]) {
    if (c.type === 'created' && /factory::Pools/.test(c.objectType || '')) {
      console.log('  FOUND factory::Pools:', c.objectId, JSON.stringify(c.owner));
    }
  }
} catch (e:any) {
  console.log('✗ still failed:', String(e.message||e).slice(0, 60));
}
