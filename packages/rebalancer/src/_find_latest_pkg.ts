import { SuiClient } from '@mysten/sui/client';
const sui = new SuiClient({ url: process.env.SUI_RPC_URL! });
const ORIG = '0x0868b71c0cba55bf0faf6c40df8c179c67a4d0ba0e79965b68b3d72d7dfbf666';

// A package upgrade creates a new package object whose objectChanges show it as 'published'.
// Find the UpgradeCap or follow the chain. Easiest: query txs that PUBLISHED packages
// with this original. Better: read a real successful open_position tx and extract the
// ACTUAL package address from the transaction's MoveCall (not the normalized type origin).
const txs = await sui.queryTransactionBlocks({
  filter: { MoveFunction: { package: ORIG, module: 'pool', function: 'open_position' } },
  options: { showInput: true, showEffects: true }, limit: 8, order: 'descending',
});
for (const tx of txs.data as any[]) {
  if (tx.effects?.status?.status !== 'success') continue;
  // the raw command shows the real package address called
  const cmds = tx.transaction?.data?.transaction?.transactions ?? [];
  for (const cmd of cmds) {
    const mc = cmd.MoveCall;
    if (mc && mc.function === 'open_position') {
      console.log('SUCCESS tx', tx.digest.slice(0,10), '-> package used:', mc.package);
    }
  }
}
