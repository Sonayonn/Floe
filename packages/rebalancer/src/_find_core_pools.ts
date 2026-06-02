import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const CORE = '0x0868b71c0cba55bf0faf6c40df8c179c67a4d0ba0e79965b68b3d72d7dfbf666';

// The factory::Pools is shared. Find it by reading the live pool's fields — a Pool
// doesn't reference Pools, but the factory event does (history-blocked).
// Reliable path: query the core package's init transaction via the package object's
// own creation. The package object 0x0868b71c was published in a tx; that tx created Pools.
try {
  const pkg = await sui.getObject({ id: CORE, options:{ showPreviousTransaction:true }});
  const tx = (pkg.data as any)?.previousTransaction;
  console.log('core pkg publish tx:', tx);
  if (tx) {
    const t = await sui.getTransactionBlock({ digest: tx, options:{ showObjectChanges:true }});
    for (const c of (t.objectChanges ?? []) as any[]) {
      if (c.type==='created' && /factory::Pools/.test(c.objectType||'')) {
        console.log('FOUND factory::Pools:', c.objectId, JSON.stringify(c.owner));
      }
    }
  }
} catch(e:any){ console.log('publish-tx path failed:', String(e.message||e).slice(0,50)); }
