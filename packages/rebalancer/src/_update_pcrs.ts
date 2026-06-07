import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromHex } from '@mysten/sui/utils';

const ENCLAVE_PKG = '0x8ecf22e78c90c3e32833d76d82415d7e4227ea370bec4efdad4c4830cbda9e49';
const CONFIG = '0x34e27a1bb7034cc6734c59b631e2362ef5515cd9d139871d8653c584825b7402';
const CAP = '0xe84af0541528abaa11123a2b5a9c9cbee0c4ac18104c4ca3f1a6b3050cb72c9f';
const OTW = '0xc9bae1737b1744108491f6c4d7c87128520d6b61151d9e3bc23c262cbc0026e0::floe_nav::FLOE_NAV';

const PCR0 = '1397e62dfb6b9d0f06e352d30e3b183699f0fde28beacd7ee68f4619701c2680dd30624ba9d3cd6490d4d9ab873dfd6f';
const PCR1 = '1397e62dfb6b9d0f06e352d30e3b183699f0fde28beacd7ee68f4619701c2680dd30624ba9d3cd6490d4d9ab873dfd6f';
const PCR2 = '21b9efbc184807662e966d34f390821309eeac6802309798826296bf3e8bec7c10edb30948c90ba67310f7b964fc500a';

const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const { secretKey } = decodeSuiPrivateKey(process.env.SUI_PRIVATE_KEY!);
const kp = Ed25519Keypair.fromSecretKey(secretKey);

const tx = new Transaction();
tx.moveCall({
  target: `${ENCLAVE_PKG}::enclave::update_pcrs`,
  typeArguments: [OTW],
  arguments: [
    tx.object(CONFIG), tx.object(CAP),
    tx.pure.vector('u8', Array.from(fromHex(PCR0))),
    tx.pure.vector('u8', Array.from(fromHex(PCR1))),
    tx.pure.vector('u8', Array.from(fromHex(PCR2))),
  ],
});
const r = await sui.signAndExecuteTransaction({ signer: kp, transaction: tx, options:{ showEffects:true }});
console.log('update_pcrs:', r.effects?.status?.status, r.effects?.status?.error ?? '', r.digest);
