import { Transaction } from '@mysten/sui/transactions';
import { makeClients } from './engine/deepbook-clients.ts';
import { FLOE, PREDICT } from './config.ts';
const { sui, signer } = makeClients();
const TS = [PREDICT.quoteType, FLOE.shareType];
const marks: [string, bigint][] = [
  ['0x3c65acb1dc798101a6a35c52bd52b6501ec49e2a42d88c99800de66607c6c988', 1_200_000n],
  ['0x3ce5ad2777e96c1ece151c40ea3d061fd7cedaaa29489d99db6be50f6aa984b5', 6_000_000n],
];
const tx = new Transaction();
for (const [id, m] of marks)
  tx.moveCall({ target: `${FLOE.packageId}::floe::mark_position`, typeArguments: TS,
    arguments: [tx.object(FLOE.vaultId), tx.object(FLOE.execCapId), tx.pure.id(id), tx.pure.u64(m)] });
const r = await sui.signAndExecuteTransaction({ signer, transaction: tx, options: { showEffects: true } });
console.log('honest marks:', r.digest, r.effects?.status?.status);
const o = await sui.getObject({ id: FLOE.vaultId, options: { showContent: true }});
console.log('mark_total now:', (o.data?.content as any).fields.positions_mark_total);
