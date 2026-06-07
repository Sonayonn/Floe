import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const VOL_PKG = '0xb94fb487c4e3068869c0f1d2b7df013aba7d15fcbabbe0834d966bc546ae2c10';
const VOL_INDEX = '0x114b2934a04bb9e063bc368ffd6cba06fd821dd54edadd48e5e118e7b57f119a';
import { Transaction } from '@mysten/sui/transactions';
const tx = new Transaction();
tx.moveCall({ target: `${VOL_PKG}::floe_vol_index::attested_vol`, arguments: [tx.object(VOL_INDEX), tx.object('0x6')] });
const r = await sui.devInspectTransactionBlock({ transactionBlock: tx, sender: '0x9a249cb07dbe8bbdf4b880255c72ed103a995bd390a72903b26797f51e366216' });
const u64 = (b: number[]) => { let v = 0n; for (let i = b.length - 1; i >= 0; i--) v = (v << 8n) + BigInt(b[i]); return v; };
const rv = r.results?.[0]?.returnValues;
if (!rv) { console.log('no attested vol (status:', r.effects?.status?.error, ')'); } else {
  console.log('ATTESTED VOL ON-CHAIN: vol_bps=', u64(rv[0][0] as number[]).toString(),
    '| spot=', u64(rv[1][0] as number[]).toString(),
    '| fresh=', (rv[4][0] as number[])[0] === 1);
}
