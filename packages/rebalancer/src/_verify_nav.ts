import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromHex } from '@mysten/sui/utils';
import { readFileSync } from 'fs';

const APP_PKG = '0xc9bae1737b1744108491f6c4d7c87128520d6b61151d9e3bc23c262cbc0026e0';
const ENCLAVE_OBJ = '0x3d2ba31849f5f2c916b812a987404554aa819e56e8da5939089327375d0cb496';
const OTW = `${APP_PKG}::floe_nav::FLOE_NAV`;

const j = JSON.parse(readFileSync('../enclave/signed_nav.json', 'utf8'));
const d = j.response.data;
const ts = j.response.timestamp_ms;
const sig = Array.from(fromHex(j.signature));
const vaultIdBytes = d.vault_id; // array of 32 u8
// vault_id as an address hex for the move arg
const vaultIdHex = '0x' + vaultIdBytes.map((b:number)=>b.toString(16).padStart(2,'0')).join('');
console.log('verifying NAV:', d.nav, 'plp_price:', d.plp_price, 'ts:', ts, 'vault:', vaultIdHex.slice(0,12)+'..');

const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const { secretKey } = decodeSuiPrivateKey(process.env.SUI_PRIVATE_KEY!);
const kp = Ed25519Keypair.fromSecretKey(secretKey);

async function tryVerify(nav: number, label: string) {
  const tx = new Transaction();
  tx.moveCall({
    target: `${APP_PKG}::floe_nav::verify_nav`,
    typeArguments: [OTW],
    arguments: [
      tx.object(ENCLAVE_OBJ),
      tx.pure.u64(nav),
      tx.pure.u64(d.plp_price),
      tx.pure.address(vaultIdHex),
      tx.pure.u64(ts),
      tx.pure.vector('u8', sig),
    ],
  });
  try {
    const r = await sui.signAndExecuteTransaction({ signer: kp, transaction: tx, options:{ showEffects:true }});
    console.log(`${label}: ${r.effects?.status?.status}`, r.effects?.status?.error ?? '', r.digest);
  } catch(e:any){ console.log(`${label}: REJECTED — ${String(e.message||e).slice(0,80)}`); }
}

// valid: the exact NAV the enclave signed
await tryVerify(d.nav, '[VALID] enclave-signed NAV');
// tampered: different NAV, same signature -> must reject
await tryVerify(d.nav + 1000000, '[TAMPERED] altered NAV, same sig');
