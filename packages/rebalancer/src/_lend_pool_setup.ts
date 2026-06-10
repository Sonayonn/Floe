import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromHex } from '@mysten/sui/utils';

const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const { secretKey } = decodeSuiPrivateKey(process.env.SUI_PRIVATE_KEY!);
const kp = Ed25519Keypair.fromSecretKey(secretKey);
const ME = kp.toSuiAddress();

const LEND_PKG   = '0x5135151fc146fff78fe52845d683e355453e86d1ae1d5adb5d6b19a3c878b992';
const LEND_ADMIN = '0x814292c8ba43a489032e162ba2dc642eb01f35aec9752d1ecbe293c9eb3dfaa9';
const VAULT      = '0xea33fe41c7512a1a36be417b0ce400ada0db0d9fe54f2ade75662aaef987de2e';
const Q_TYPE     = '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC';
const S_TYPE     = '0x120c29a65c10ada7619429e46a608531cfcb4affe14439ca6838aaa77dfd029f::share::SHARE';
const ATTESTER   = 'c680e5cbba385860e22ce71113a2ef06c18bc43a87826a8ec67e79f85cfb37eb';

async function run(tx: Transaction, label: string) {
  const r = await sui.signAndExecuteTransaction({
    signer: kp, transaction: tx, options: { showEffects: true, showObjectChanges: true },
  });
  console.log(`${label}: ${r.effects?.status?.status} ${r.effects?.status?.error ?? ''} ${r.digest}`);
  return r;
}

(async () => {
  console.log('sender:', ME);

  // 1) create_pool for the Stratos vault's SHARE
  const tx1 = new Transaction();
  tx1.moveCall({
    target: `${LEND_PKG}::floe_lend::create_pool`,
    typeArguments: [Q_TYPE, S_TYPE],
    arguments: [tx1.object(LEND_ADMIN), tx1.pure.id(VAULT)],
  });
  const r1 = await run(tx1, '1. create_pool');
  let POOL = '';
  for (const c of (r1.objectChanges ?? []) as any[]) {
    if (c.type === 'created' && /LendingPool/.test(c.objectType || '')) {
      POOL = c.objectId; console.log('   POOL:', POOL, JSON.stringify(c.owner));
    }
  }
  if (!POOL) { console.log('NO POOL CREATED — stopping'); return; }

  // 2) register_collateral_attester (the live enclave pubkey)
  const tx2 = new Transaction();
  tx2.moveCall({
    target: `${LEND_PKG}::floe_lend::register_collateral_attester`,
    typeArguments: [Q_TYPE, S_TYPE],
    arguments: [tx2.object(LEND_ADMIN), tx2.object(POOL), tx2.pure.vector('u8', Array.from(fromHex(ATTESTER)))],
  });
  await run(tx2, '2. register_collateral_attester');

  console.log('\nPOOL_ID=' + POOL);
  console.log('Paste this; next I will seed the pool + do the live attested borrow.');
})();
