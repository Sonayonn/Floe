import { SuiClient } from '@mysten/sui/client';
const sui = new SuiClient({ url: process.env.SUI_RPC_URL! });
const COIN = '0x26b3bc67befc214058ca78ea9a2690298d731a2d4309485ec3d40198063c4abc';

// Find recent calls to the faucet functions — read the Supply object from their inputs.
for (const mod of ['cetus','usdt','usdc']) {
  try {
    const txs = await sui.queryTransactionBlocks({
      filter: { MoveFunction: { package: COIN, module: mod, function: 'faucet' } },
      options: { showInput: true }, limit: 1, order: 'descending',
    });
    if (!txs.data.length) { console.log(`${mod}::faucet — no recent calls`); continue; }
    const tx: any = txs.data[0];
    // dig the shared object input (the Supply) out of the programmable tx
    const inputs = tx.transaction?.data?.transaction?.inputs ?? [];
    const shared = inputs.filter((i:any)=> i.type==='object' && i.objectType!=='immOrOwnedObject');
    console.log(`${mod}::faucet — tx ${tx.digest.slice(0,10)} shared inputs:`);
    for (const s of shared) console.log(`    ${JSON.stringify(s).slice(0,120)}`);
  } catch(e:any){ console.log(`${mod}: ${String(e.message||e).slice(0,50)}`); }
}
