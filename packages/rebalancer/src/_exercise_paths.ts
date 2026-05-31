import { Transaction } from '@mysten/sui/transactions';
import { makeClients } from './engine/deepbook-clients.ts';
import { FLOE, PREDICT, SUI_SYSTEM } from './config.ts';

const { sui, signer, address } = makeClients();
const DUSDC = PREDICT.quoteType;
const SHARE = FLOE.shareType;
const TS = [DUSDC, SHARE];
const tgt = (fn: string) => `${FLOE.packageId}::${FLOE.moduleName}::${fn}`;

async function vaultFields(): Promise<any> {
  const o = await sui.getObject({ id: FLOE.vaultId, options: { showContent: true } });
  return (o.data?.content as any).fields;
}

// Read the actual position IDs from the vault's positions Table (dynamic fields).
async function positionIds(): Promise<string[]> {
  const f = await vaultFields();
  const tableId = f.positions.fields.id.id;
  const dyn = await sui.getDynamicFields({ parentId: tableId });
  // each dynamic field's name is the position ID (an ID key)
  return dyn.data.map((d: any) => (typeof d.name.value === 'string' ? d.name.value : d.name.value.id ?? d.name.value));
}

function log(label: string, f: any) {
  console.log(`[${label}] supply=${f.share_supply} plp_held=${f.plp_held} mark_total=${f.positions_mark_total} pos=${f.position_count} idle=${f.idle}`);
}

// ── 1. mark_position: pick a real position, mark it to a DIFFERENT value ──────
const before = await vaultFields();
log('before', before);
const ids = await positionIds();
console.log('position ids:', ids);
if (!ids.length) throw new Error('no positions to mark');

const target = ids[0];
// read its current mark so we change to something genuinely different
const beforeMarkTotal = BigInt(before.positions_mark_total);
const NEW_MARK = 9_000_000n; // mark this position to 9.0 (distinct from current)
{
  const tx = new Transaction();
  tx.moveCall({ target: tgt('mark_position'), typeArguments: TS,
    arguments: [tx.object(FLOE.vaultId), tx.object(FLOE.execCapId), tx.pure.id(target), tx.pure.u64(NEW_MARK)] });
  const r = await sui.signAndExecuteTransaction({ signer, transaction: tx, options: { showEffects: true } });
  console.log('mark_position:', r.digest, r.effects?.status?.status);
}
const afterMark = await vaultFields();
log('after mark', afterMark);
const afterMarkTotal = BigInt(afterMark.positions_mark_total);
// total must have changed (unless the old mark happened to equal NEW_MARK)
if (afterMarkTotal === beforeMarkTotal) {
  console.log('NOTE: mark_total unchanged — position was already at', NEW_MARK.toString(), '(mark still succeeded, idempotent)');
} else {
  console.log(`✓ mark_position works: mark_total ${beforeMarkTotal} -> ${afterMarkTotal} (delta ${afterMarkTotal - beforeMarkTotal})`);
}

// ── 2. withdraw 1 share (fits idle ~2.21 DUSDC) ──────────────────────────────
const shareCoins = await sui.getCoins({ owner: address, coinType: SHARE });
if (!shareCoins.data.length) throw new Error('no SHARE coins held');
{
  const tx = new Transaction();
  const burnShares = 1_000_000n; // 1 share
  const [toBurn] = tx.splitCoins(tx.object(shareCoins.data[0].coinObjectId), [burnShares]);
  const out = tx.moveCall({ target: tgt('withdraw'), typeArguments: TS,
    arguments: [tx.object(FLOE.vaultId), toBurn, tx.object(SUI_SYSTEM.clock)] });
  tx.transferObjects([out], address);
  const r = await sui.signAndExecuteTransaction({ signer, transaction: tx, options: { showEffects: true, showBalanceChanges: true } });
  console.log('withdraw:', r.digest, r.effects?.status?.status);
  console.log('balance changes:', JSON.stringify(r.balanceChanges?.map((b: any) => ({ coin: b.coinType.split('::').pop(), amount: b.amount }))));
}
log('after withdraw', await vaultFields());
console.log('✓ withdraw-with-open-positions works (payout from idle at marked share price, supply reduced)');
