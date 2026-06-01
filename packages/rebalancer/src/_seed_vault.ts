import { Transaction } from '@mysten/sui/transactions';
import { makeClients } from './engine/deepbook-clients.ts';
import { FLOE, PREDICT, SUI_SYSTEM } from './config.ts';

const { sui, signer, address } = makeClients();
const DUSDC = PREDICT.quoteType;
const AMOUNT = 15_000_000; // 15 DUSDC (6dp) — plenty to prove PLP custody

const coins = await sui.getCoins({ owner: address, coinType: DUSDC });
if (!coins.data.length) throw new Error('no DUSDC');
const total = coins.data.reduce((s, c) => s + BigInt(c.balance), 0n);
if (total < BigInt(AMOUNT)) throw new Error(`need ${AMOUNT}, have ${total}`);

const tx = new Transaction();
const primary = tx.object(coins.data[0].coinObjectId);
// merge all other DUSDC coins into the primary so the full balance is available
if (coins.data.length > 1) {
  tx.mergeCoins(primary, coins.data.slice(1).map((c) => tx.object(c.coinObjectId)));
}
const [c] = tx.splitCoins(primary, [AMOUNT]);
const [shares] = tx.moveCall({
  target: `${FLOE.packageId}::${FLOE.moduleName}::deposit`,
  typeArguments: [DUSDC, FLOE.shareType],
  arguments: [tx.object(FLOE.vaultId), c, tx.object(SUI_SYSTEM.clock)],
});
tx.transferObjects([shares], address);

const res = await sui.signAndExecuteTransaction({ signer, transaction: tx, options: { showEffects: true } });
console.log('Seed deposit tx:', res.digest, res.effects?.status?.status);
console.log(`Seeded ${AMOUNT / 1e6} DUSDC into v3.2 reference vault (via upgraded package).`);
