/**
 * Probe: deposit collateral → borrow 1 DBUSDC via DeepBook Margin, fresh Pyth.
 * Closes the Day 6 / code-7 gap. Error 7 = risk-ratio check (Total Assets /
 * Total Debt below the ~1.25 borrow threshold). Fix: deposit collateral first.
 *
 * API note: depositQuote takes {managerKey, amount}; borrowQuote/repayQuote
 * take (managerKey, amount) positionally.
 */

import { Transaction } from '@mysten/sui/transactions';
import { makeClients } from './engine/deepbook-clients.ts';

const { sui, deepbook, pyth, hermes, signer, address } = makeClients();

const SUI_FEED = '0x50c67b3fd225db8912a424dd4baed60ffdde625ed2feaaf283724f9608fea266';
const DBUSDC_FEED = '0x41f3625971ca2ed2263e78573fe5ce23e13d2558ed3f2e47ab0f84fb9e7ae722';

console.log('Sender:', address);

const priceUpdateData = await hermes.getPriceFeedsUpdateData([SUI_FEED, DBUSDC_FEED]);

const tx = new Transaction();

// 1. Deposit 10 DBUSDC collateral (object-style API)
deepbook.marginManager.depositQuote({ managerKey: 'FLOE_HEDGE', amount: 10 })(tx);

// 2. Fresh Pyth prices, immediately before the borrow (15s freshness window)
await pyth.updatePriceFeeds(tx, priceUpdateData, [SUI_FEED, DBUSDC_FEED]);

// 3. Borrow 1 DBUSDC (positional API) — risk ratio now ~11/1, above ~1.25
deepbook.marginManager.borrowQuote('FLOE_HEDGE', 1)(tx);

const res = await sui.signAndExecuteTransaction({
  signer, transaction: tx,
  options: { showEffects: true, showBalanceChanges: true },
});

console.log('Tx:', res.digest);
console.log('Status:', res.effects?.status?.status);
console.log('Error:', res.effects?.status?.error ?? 'none');
console.log('Explorer:', `https://suiscan.xyz/testnet/tx/${res.digest}`);
for (const b of res.balanceChanges ?? []) {
  console.log(`  ${b.coinType.split('::').pop()?.padEnd(8)} ${b.amount}`);
}
