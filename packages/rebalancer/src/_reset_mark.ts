import { Transaction } from '@mysten/sui/transactions';
import { makeClients } from './engine/deepbook-clients.ts';
import { FLOE, PREDICT } from './config.ts';
const { sui, signer } = makeClients();
const TS = [PREDICT.quoteType, FLOE.shareType];
const POS1 = '0x3c65acb1dc798101a6a35c52bd52b6501ec49e2a42d88c99800de66607c6c988';
const tx = new Transaction();
// reset to ~premium (realistic fresh-mint mark): position #1 funded ~6.0
tx.moveCall({ target: `${FLOE.packageId}::floe::mark_position`, typeArguments: TS,
  arguments: [tx.object(FLOE.vaultId), tx.object(FLOE.execCapId), tx.pure.id(POS1), tx.pure.u64(6_000_000n)] });
const r = await sui.signAndExecuteTransaction({ signer, transaction: tx, options: { showEffects: true } });
console.log('reset mark:', r.digest, r.effects?.status?.status);
const o = await sui.getObject({ id: FLOE.vaultId, options: { showContent: true }});
console.log('mark_total now:', (o.data?.content as any).fields.positions_mark_total);
