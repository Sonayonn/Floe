import { SuiClient } from '@mysten/sui/client';
const sui = new SuiClient({ url: process.env.SUI_RPC_URL! });
const COIN = '0x26b3bc67befc214058ca78ea9a2690298d731a2d4309485ec3d40198063c4abc';

const pkgObj = await sui.getObject({ id: COIN, options: { showPreviousTransaction: true } });
const publishTx = (pkgObj.data as any)?.previousTransaction;
console.log('coin pkg publish tx:', publishTx);
const tx = await sui.getTransactionBlock({ digest: publishTx, options: { showObjectChanges: true } });
console.log('Supply objects (for faucet):');
for (const c of (tx.objectChanges ?? []) as any[]) {
  if (c.type === 'created' && /Supply/.test(c.objectType || '')) {
    const sym = c.objectType.split('::').slice(-1)[0];
    const shared = c.owner?.Shared ? `shared@${c.owner.Shared.initial_shared_version}` : JSON.stringify(c.owner).slice(0,40);
    console.log(`  ${sym}: ${c.objectId}  (${shared})`);
  }
}
