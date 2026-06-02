import { SuiClient } from '@mysten/sui/client';
const sui = new SuiClient({ url: process.env.SUI_RPC_URL! });
const COIN = '0x26b3bc67befc214058ca78ea9a2690298d731a2d4309485ec3d40198063c4abc';
const out: Record<string,string> = {};
for (const mod of ['cetus','usdt']) {
  const txs = await sui.queryTransactionBlocks({
    filter: { MoveFunction: { package: COIN, module: mod, function: 'faucet' } },
    options: { showInput: true }, limit: 1, order: 'descending',
  });
  const tx: any = txs.data[0];
  const inputs = tx.transaction?.data?.transaction?.inputs ?? [];
  for (const i of inputs) {
    if (i.type==='object' && i.objectId) { out[mod] = i.objectId; }
  }
}
console.log(JSON.stringify(out, null, 2));
