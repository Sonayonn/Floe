import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

const VOL_PKG = '0xc3400957c89e4be866b31fbb3d7679a5a8723aa789821800c00c245165110f34';
const ORACLE = '0xb79524498a9947307e192d8045772150dc47aade4f9e09bd4b6fe3236b9e3125';
const CLOCK = '0x6';

const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const { secretKey } = decodeSuiPrivateKey(process.env.SUI_PRIVATE_KEY!);
const kp = Ed25519Keypair.fromSecretKey(secretKey);

// find the VolIndex object from the package's publish tx
const pkgObj = await sui.getObject({ id: VOL_PKG, options:{ showPreviousTransaction:true }});
const ptx = (pkgObj.data as any)?.previousTransaction;
const t = await sui.getTransactionBlock({ digest: ptx, options:{ showObjectChanges:true }});
let VOL_INDEX = '';
for (const c of (t.objectChanges ?? []) as any[]) {
  if (c.type==='created' && /VolIndex/.test(c.objectType||'')) { VOL_INDEX = c.objectId; console.log('VolIndex:', c.objectId, JSON.stringify(c.owner)); }
}

// 1) devInspect vol_now against the LIVE oracle (read-only, proves the on-chain compute)
const insp = new Transaction();
insp.moveCall({ target: `${VOL_PKG}::floe_vol_index::vol_now`, arguments: [insp.object(ORACLE), insp.object(CLOCK)] });
const r = await sui.devInspectTransactionBlock({ transactionBlock: insp, sender: kp.toSuiAddress() });
const rv = r.results?.[0]?.returnValues?.[0];
if (rv) {
  const bytes = rv[0] as number[];
  // u64 LE
  let v = 0n; for (let i=bytes.length-1;i>=0;i--) v = (v<<8n) + BigInt(bytes[i]);
  console.log('LIVE vol_now =', v.toString(), 'bps =', (Number(v)/100).toFixed(2)+'%');
}

// 2) actually snapshot it on-chain (update_vol_index) for a permanent record
if (VOL_INDEX) {
  const tx = new Transaction();
  tx.moveCall({ target: `${VOL_PKG}::floe_vol_index::update_vol_index`, arguments: [tx.object(VOL_INDEX), tx.object(ORACLE), tx.object(CLOCK)] });
  const ex = await sui.signAndExecuteTransaction({ signer: kp, transaction: tx, options:{ showEffects:true }});
  console.log('update_vol_index:', ex.effects?.status?.status, ex.digest);
}
