import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { fromHex } from '@mysten/sui/utils';

const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const kp = Ed25519Keypair.fromSecretKey(process.env.SUI_PRIVATE_KEY!);
const VOL_PKG = '0xb94fb487c4e3068869c0f1d2b7df013aba7d15fcbabbe0834d966bc546ae2c10';
const VOL_INDEX = '0x114b2934a04bb9e063bc368ffd6cba06fd821dd54edadd48e5e118e7b57f119a';
const PUBKEY = 'f068812694d6dfd26f9d9b29ad325d38e334bfe2ad90e1bb1eee7c3da87f058c'; // this boot's enclave key

const tx = new Transaction();
tx.moveCall({
  target: `${VOL_PKG}::floe_vol_index::register_vol_attester`,
  arguments: [tx.object(VOL_INDEX), tx.pure.vector('u8', Array.from(fromHex(PUBKEY)))],
});
const r = await sui.signAndExecuteTransaction({ signer: kp, transaction: tx, options: { showEffects: true } });
console.log('register_vol_attester:', r.effects?.status?.status, r.effects?.status?.error ?? '', r.digest);
