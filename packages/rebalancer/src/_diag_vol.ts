import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { fromHex } from '@mysten/sui/utils';
import { readFileSync } from 'fs';

const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const kp = Ed25519Keypair.fromSecretKey(process.env.SUI_PRIVATE_KEY!);
const VOL_PKG = '0xb94fb487c4e3068869c0f1d2b7df013aba7d15fcbabbe0834d966bc546ae2c10';
const VOL_INDEX = '0x114b2934a04bb9e063bc368ffd6cba06fd821dd54edadd48e5e118e7b57f119a';
const arrToHex = (a: number[]) => '0x' + a.map((x) => x.toString(16).padStart(2, '0')).join('');

const vol = JSON.parse(readFileSync('../enclave/vol_signed.json', 'utf8')).response;
const volSig = JSON.parse(readFileSync('../enclave/vol_signed.json', 'utf8')).signature;

console.log('signed vol timestamp_ms:', vol.timestamp_ms, '| now:', Date.now(), '| age(min):', ((Date.now() - vol.timestamp_ms) / 60000).toFixed(1));

const tx = new Transaction();
tx.moveCall({
  target: `${VOL_PKG}::floe_vol_index::update_vol_attested`,
  arguments: [
    tx.object(VOL_INDEX), tx.pure.id(arrToHex(vol.data.oracle_id)),
    tx.pure.u64(vol.data.vol_bps), tx.pure.u64(vol.data.spot), tx.pure.u64(vol.timestamp_ms),
    tx.pure.vector('u8', Array.from(fromHex(volSig))), tx.object('0x6'),
  ],
});
const r = await sui.devInspectTransactionBlock({ transactionBlock: tx, sender: kp.toSuiAddress() });
console.log('status:', r.effects?.status?.status);
console.log('error:', r.effects?.status?.error);

const idx: any = await sui.getObject({ id: VOL_INDEX, options: { showContent: true } });
console.log('VolIndex fields:', JSON.stringify(idx.data?.content?.fields ?? {}).slice(0, 200));

// is there a vol attester registered? check dynamic fields
const dfs = await sui.getDynamicFields({ parentId: VOL_INDEX });
console.log('VolIndex dynamic fields:', dfs.data.map((d) => d.name).slice(0, 5));
