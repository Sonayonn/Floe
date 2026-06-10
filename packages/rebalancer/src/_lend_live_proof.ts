import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { fromHEX } from '@mysten/sui/utils';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';

const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const _sk = process.env.SUI_PRIVATE_KEY!;
const kp = _sk.startsWith('suiprivkey')
  ? Ed25519Keypair.fromSecretKey(decodeSuiPrivateKey(_sk).secretKey)
  : Ed25519Keypair.fromSecretKey(fromHEX(_sk.replace(/^0x/, '')));
const ME = kp.toSuiAddress();

// === canonical IDs ===
const NAV_PKG    = '0x07677cefab304e5d27d8e2dc4aed20a6ef0f9b8bbadf25de67f61a574a658d7a';
const ENCLAVE_PKG= '0x8ecf22e78c90c3e32833d76d82415d7e4227ea370bec4efdad4c4830cbda9e49';
const ENCLAVE_CONFIG = '0x34e27a1bb7034cc6734c59b631e2362ef5515cd9d139871d8653c584825b7402';
const CAP        = '0xe84af0541528abaa11123a2b5a9c9cbee0c4ac18104c4ca3f1a6b3050cb72c9f';
const OTW_TYPE   = '0xc9bae1737b1744108491f6c4d7c87128520d6b61151d9e3bc23c262cbc0026e0::floe_nav::FLOE_NAV';

const LEND_PKG   = '0x5135151fc146fff78fe52845d683e355453e86d1ae1d5adb5d6b19a3c878b992';
const LEND_ADMIN = '0x814292c8ba43a489032e162ba2dc642eb01f35aec9752d1ecbe293c9eb3dfaa9';
const VAULT      = '0xea33fe41c7512a1a36be417b0ce400ada0db0d9fe54f2ade75662aaef987de2e';
const Q_TYPE     = '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC';
const S_TYPE     = '0x120c29a65c10ada7619429e46a608531cfcb4affe14439ca6838aaa77dfd029f::share::SHARE';

const NEW_PCR0 = 'b4d532247e4750b239548897063dba140995db04529f9aceea5936f139f2c031e43871b1b69418d86822e72b0f0d6cab';
const NEW_PCR1 = NEW_PCR0;
const NEW_PCR2 = '21b9efbc184807662e966d34f390821309eeac6802309798826296bf3e8bec7c10edb30948c90ba67310f7b964fc500a';
const NEW_ATTESTER = 'c680e5cbba385860e22ce71113a2ef06c18bc43a87826a8ec67e79f85cfb37eb';

async function run(tx: Transaction, label: string) {
  const r = await sui.signAndExecuteTransaction({
    signer: kp, transaction: tx,
    options: { showEffects: true, showObjectChanges: true },
  });
  const status = r.effects?.status?.status;
  console.log(`${label}: ${status} ${r.digest}`);
  if (status !== 'success') console.log('  error:', JSON.stringify(r.effects?.status));
  return r;
}

(async () => {
  console.log('sender:', ME);

  // 1) update_pcrs to the new measurement
  {
    const tx = new Transaction();
    tx.moveCall({
      target: `${NAV_PKG}::floe_nav::update_pcrs`,
      typeArguments: [OTW_TYPE],
      arguments: [
        tx.object(ENCLAVE_CONFIG), tx.object(CAP),
        tx.pure.vector('u8', Array.from(fromHEX(NEW_PCR0))),
        tx.pure.vector('u8', Array.from(fromHEX(NEW_PCR1))),
        tx.pure.vector('u8', Array.from(fromHEX(NEW_PCR2))),
      ],
    });
    await run(tx, '1. update_pcrs');
  }
  console.log('\nDONE step 1. Paste output; I will give steps 2-5 (register_enclave needs the attestation doc flow).');
})();
