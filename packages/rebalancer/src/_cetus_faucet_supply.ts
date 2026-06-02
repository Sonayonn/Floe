import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const COIN='0x26b3bc67befc214058ca78ea9a2690298d731a2d4309485ec3d40198063c4abc';
// Supply objects are shared, created at publish. The faucet fn signature told us the type:
// 0x26b3bc67...::usdc::USDCSupply etc. Find them via the package's init transaction objects.
// Reliable path: getObject won't enumerate; instead query the publish tx's created objects.
// The package object's previousTransaction is the publish tx.
const pkgObj = await sui.getObject({ id: COIN, options:{ showPreviousTransaction:true }});
const publishTx = (pkgObj.data as any)?.previousTransaction;
console.log('publish tx:', publishTx);
if (publishTx) {
  const tx = await sui.getTransactionBlock({ digest: publishTx, options:{ showObjectChanges:true }});
  for (const c of (tx.objectChanges ?? []) as any[]) {
    if (c.type==='created' && /Supply/.test(c.objectType ?? '')) {
      console.log(`  ${c.objectType?.split('::').slice(-1)[0]}: ${c.objectId}  (owner: ${JSON.stringify(c.owner).slice(0,40)})`);
    }
  }
}
