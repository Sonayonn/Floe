/**
 * Unwind the probe hedge: repay the borrow, withdraw collateral.
 * withdrawQuote returns the withdrawn Coin — we must transfer it (else
 * UnusedValueWithoutDrop). repayQuote with no amount repays max debt.
 */

import { Transaction } from '@mysten/sui/transactions';
import { makeClients } from './engine/deepbook-clients.ts';

const { sui, deepbook, pyth, hermes, signer, address } = makeClients();

const SUI_FEED = '0x50c67b3fd225db8912a424dd4baed60ffdde625ed2feaaf283724f9608fea266';
const DBUSDC_FEED = '0x41f3625971ca2ed2263e78573fe5ce23e13d2558ed3f2e47ab0f84fb9e7ae722';

const priceUpdateData = await hermes.getPriceFeedsUpdateData([SUI_FEED, DBUSDC_FEED]);

const tx = new Transaction();

// Fresh prices first (withdraw checks risk ratio)
await pyth.updatePriceFeeds(tx, priceUpdateData, [SUI_FEED, DBUSDC_FEED]);

// Repay full debt (no amount = max). Capture+transfer any returned coin defensively.
const repayRet = deepbook.marginManager.repayQuote('FLOE_HEDGE')(tx);

// Withdraw the 10 DBUSDC collateral — RETURNS a Coin we must consume.
const withdrawnCoin = deepbook.marginManager.withdrawQuote('FLOE_HEDGE', 10)(tx);

// Transfer the withdrawn collateral back to ourselves.
tx.transferObjects([withdrawnCoin], address);

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
