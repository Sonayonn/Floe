import { SuiClient } from '@mysten/sui/client';
const sui = new SuiClient({ url: process.env.SUI_RPC_URL! });
const PKG = '0xc9bae1737b1744108491f6c4d7c87128520d6b61151d9e3bc23c262cbc0026e0';
const pkgObj = await sui.getObject({ id: PKG, options: { showPreviousTransaction: true } });
const ptx = (pkgObj.data as any)?.previousTransaction;
console.log('publish tx:', ptx);
const t = await sui.getTransactionBlock({ digest: ptx, options: { showObjectChanges: true } });
for (const c of (t.objectChanges ?? []) as any[]) {
  if (c.type === 'created') {
    const ot = c.objectType || '';
    if (/EnclaveConfig|Cap</.test(ot)) {
      const shared = c.owner?.Shared ? `shared@${c.owner.Shared.initial_shared_version}` : 'owned';
      console.log(`${ot.split('::').slice(-2).join('::').slice(0,30)}: ${c.objectId} (${shared})`);
    }
  }
}
