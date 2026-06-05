import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromHex } from '@mysten/sui/utils';
import { readFileSync } from 'fs';

const FLOE_PKG = '0x7869a58cb2246136a5a00e2d74a59e1b6e3e1f87c8ecd9ea92b210f228f2d6ca'; // V9
const VAULT = '0xea33fe41c7512a1a36be417b0ce400ada0db0d9fe54f2ade75662aaef987de2e';
const OWNER_CAP = '0x1c177a80d8ea78b84884944292f9f9af657308c64d5877028de718ff5f851f1e';
const Q = '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC';
const S = '0x120c29a65c10ada7619429e46a608531cfcb4affe14439ca6838aaa77dfd029f::share::SHARE';

const pubkeyHex = JSON.parse(readFileSync('../enclave/heartbeat.json', 'utf8')).pubkey;
console.log('registering attester pubkey:', pubkeyHex);

const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const { secretKey } = decodeSuiPrivateKey(process.env.SUI_PRIVATE_KEY!);
const kp = Ed25519Keypair.fromSecretKey(secretKey);

const tx = new Transaction();
tx.moveCall({
  target: `${FLOE_PKG}::floe::register_attester`,
  typeArguments: [Q, S],
  arguments: [
    tx.object(VAULT),
    tx.object(OWNER_CAP),
    tx.pure.vector('u8', Array.from(fromHex(pubkeyHex))),
  ],
});
const r = await sui.signAndExecuteTransaction({ signer: kp, transaction: tx, options: { showEffects: true } });
console.log('register_attester:', r.effects?.status?.status, r.effects?.status?.error ?? '', r.digest);
