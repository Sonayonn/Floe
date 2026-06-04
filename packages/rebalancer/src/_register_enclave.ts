import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromHex } from '@mysten/sui/utils';
import { readFileSync } from 'fs';

const ENCLAVE_PKG = '0x8ecf22e78c90c3e32833d76d82415d7e4227ea370bec4efdad4c4830cbda9e49';
const APP_PKG = '0xc9bae1737b1744108491f6c4d7c87128520d6b61151d9e3bc23c262cbc0026e0';
const CONFIG = '0x34e27a1bb7034cc6734c59b631e2362ef5515cd9d139871d8653c584825b7402';
const OTW = `${APP_PKG}::floe_nav::FLOE_NAV`;

const att = JSON.parse(readFileSync('../enclave/attestation.json', 'utf8')).attestation;
const attBytes = Array.from(fromHex(att));
console.log('attestation bytes:', attBytes.length);

const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const { secretKey } = decodeSuiPrivateKey(process.env.SUI_PRIVATE_KEY!);
const kp = Ed25519Keypair.fromSecretKey(secretKey);

const tx = new Transaction();
const doc = tx.moveCall({
  target: '0x2::nitro_attestation::load_nitro_attestation',
  arguments: [tx.pure.vector('u8', attBytes), tx.object('0x6')],
});
tx.moveCall({
  target: `${ENCLAVE_PKG}::enclave::register_enclave`,
  typeArguments: [OTW],
  arguments: [tx.object(CONFIG), doc],
});
const r = await sui.signAndExecuteTransaction({
  signer: kp, transaction: tx,
  options: { showEffects: true, showObjectChanges: true },
});
console.log('register_enclave:', r.effects?.status?.status, r.effects?.status?.error ?? '');
console.log('digest:', r.digest);
for (const c of (r.objectChanges ?? []) as any[]) {
  if (c.type === 'created' && /Enclave/.test(c.objectType || '')) {
    console.log('LIVE ENCLAVE:', c.objectId, JSON.stringify(c.owner));
  }
}
