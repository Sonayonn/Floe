import { SuiClient } from '@mysten/sui/client';
const sui = new SuiClient({ url: process.env.SUI_RPC_URL! });
const ORIG = '0x0868b71c0cba55bf0faf6c40df8c179c67a4d0ba0e79965b68b3d72d7dfbf666';

// 1) The GlobalConfig stores the current allowed package version.
const gc = await sui.getObject({ id: '0x6f4149091a5aea0e818e7243a13adcfb403842d670b9a2089de058512620687a', options:{ showContent:true }});
const gf:any = (gc.data?.content as any)?.fields ?? {};
console.log('GlobalConfig fields:', Object.keys(gf).join(', '));
console.log('  package_version:', gf.package_version ?? gf.version ?? '(see fields)');

// 2) Find the latest package address: follow the upgrade chain from the original.
//    The original package's later versions share the same "original ID" but have new addresses.
//    Query a recent pool tx to see which package address real callers use.
const txs = await sui.queryTransactionBlocks({
  filter: { MoveFunction: { package: ORIG, module: 'pool', function: 'open_position' } },
  options: { showInput: true }, limit: 1, order: 'descending',
});
if (txs.data.length) {
  const tx:any = txs.data[0];
  const cmds = tx.transaction?.data?.transaction?.transactions ?? [];
  for (const cmd of cmds) {
    if (cmd.MoveCall?.function === 'open_position') {
      console.log('\nReal recent open_position call used package:', cmd.MoveCall.package);
    }
  }
} else {
  console.log('\nno recent open_position calls found via ORIG package filter');
}
