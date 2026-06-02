import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { bcs } from '@mysten/sui/bcs';
import { fromHex } from '@mysten/sui/utils';

const PKG = process.env.FLOE_PKG!;
const VAULT = process.env.VAULT!;
const OWNER_CAP = process.env.OWNER_CAP!;
const EXEC_CAP = process.env.EXEC_CAP!;
const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const { secretKey } = decodeSuiPrivateKey(process.env.SUI_PRIVATE_KEY!);
const owner = Ed25519Keypair.fromSecretKey(secretKey);

const attester = new Ed25519Keypair();
const attesterPub = attester.getPublicKey().toRawBytes();
console.log('attester pubkey:', Buffer.from(attesterPub).toString('hex').slice(0,16) + '... len=' + attesterPub.length);

// register_attester
{
  const tx = new Transaction();
  tx.moveCall({ target: `${PKG}::floe::register_attester`,
    typeArguments: [process.env.Q!, process.env.S!],
    arguments: [tx.object(VAULT), tx.object(OWNER_CAP), tx.pure.vector('u8', Array.from(attesterPub))] });
  const r = await sui.signAndExecuteTransaction({ signer: owner, transaction: tx, options:{ showEffects:true }});
  console.log('register_attester:', r.effects?.status?.status, r.effects?.status?.error ?? '');
}

function buildMsg(vaultId: string, price: bigint, ts: bigint): Uint8Array {
  const idBytes = fromHex(vaultId.replace(/^0x/, ''));
  const priceBytes = bcs.u64().serialize(price).toBytes();
  const tsBytes = bcs.u64().serialize(ts).toBytes();
  const out = new Uint8Array(idBytes.length + 16);
  out.set(idBytes, 0); out.set(priceBytes, idBytes.length); out.set(tsBytes, idBytes.length + 8);
  return out;
}

const price = 1_002_000n;
const plpHeld = 7_490_000n;
const ts = BigInt(Date.now());
const msg = buildMsg(VAULT, price, ts);
const sig = await attester.sign(msg);
console.log('signature len:', sig.length, '(expect 64)');

async function submit(p: bigint, signature: Uint8Array, label: string) {
  const tx = new Transaction();
  tx.moveCall({ target: `${PKG}::floe::update_nav_attested`,
    typeArguments: [process.env.Q!, process.env.S!],
    arguments: [tx.object(VAULT), tx.object(EXEC_CAP),
      tx.pure.u64(p), tx.pure.u64(plpHeld), tx.pure.u64(ts),
      tx.pure.vector('u8', Array.from(signature)), tx.object('0x6')] });
  try {
    const r = await sui.signAndExecuteTransaction({ signer: owner, transaction: tx, options:{ showEffects:true }});
    console.log(`${label}: ${r.effects?.status?.status}`, r.effects?.status?.error ?? '');
  } catch(e:any){ console.log(`${label}: REJECTED — ${String(e.message||e).slice(0,90)}`); }
}

await submit(price, sig, '[VALID] correct price+sig');
await submit(price + 50_000n, sig, '[TAMPERED] wrong price same sig');
