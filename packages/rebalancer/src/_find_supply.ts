import { SuiClient } from '@mysten/sui/client';
// Use an alternate testnet RPC that retains history (default node prunes).
const RPCS = [
  'https://sui-testnet.public.blastapi.io',
  'https://sui-testnet-endpoint.blockvision.org',
  'https://fullnode.testnet.sui.io',
];
const COIN='0x26b3bc67befc214058ca78ea9a2690298d731a2d4309485ec3d40198063c4abc';

for (const url of RPCS) {
  try {
    const sui = new SuiClient({ url });
    const pkgObj = await sui.getObject({ id: COIN, options:{ showPreviousTransaction:true }});
    const publishTx = (pkgObj.data as any)?.previousTransaction;
    if (!publishTx) { console.log(`${url}: no prevTx`); continue; }
    const tx = await sui.getTransactionBlock({ digest: publishTx, options:{ showObjectChanges:true }});
    console.log(`\n✓ ${url} resolved publish tx:`);
    for (const c of (tx.objectChanges ?? []) as any[]) {
      if (c.type==='created' && /Supply/.test(c.objectType ?? '')) {
        const sym = c.objectType.split('::').slice(-1)[0];
        const shared = c.owner?.Shared ? `shared@${c.owner.Shared.initial_shared_version}` : JSON.stringify(c.owner).slice(0,30);
        console.log(`  ${sym}: ${c.objectId}  (${shared})`);
      }
    }
    break; // first working RPC is enough
  } catch(e:any){ console.log(`${url}: ${String(e.message||e).slice(0,50)}`); }
}
