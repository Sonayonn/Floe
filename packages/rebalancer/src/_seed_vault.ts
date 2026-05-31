import { Transaction } from '@mysten/sui/transactions';
import { makeClients } from './engine/deepbook-clients.ts';
import { FLOE, PREDICT, SUI_SYSTEM } from './config.ts';

const { sui, signer, address } = makeClients();
const DUSDC = PREDICT.quoteType;
const AMOUNT = 20_000_000; // 20 DUSDC (6dp)

const coins = await sui.getCoins({ owner: address, coinType: DUSDC });
if (!coins.data.length) throw new Error('no DUSDC');

const tx = new Transaction();
const [c] = tx.splitCoins(tx.object(coins.data[0].coinObjectId), [AMOUNT]);
const [shares] = tx.moveCall({
  target: `${FLOE.packageId}::${FLOE.moduleName}::deposit`,
  typeArguments: [DUSDC, FLOE.shareType],
  arguments: [tx.object(FLOE.vaultId), c, tx.object(SUI_SYSTEM.clock)],
});
tx.transferObjects([shares], address);

const res = await sui.signAndExecuteTransaction({ signer, transaction: tx, options: { showEffects: true }});
console.log('Seed deposit tx:', res.digest, res.effects?.status?.status);
