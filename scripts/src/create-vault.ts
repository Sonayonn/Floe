import 'dotenv/config';
import { Transaction } from '@mysten/sui/transactions';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { makeSuiClient } from './lib/sui.js';

const PKG = '0x2f8f55dacfcac4f0b9d56cf3cfc3fd560dc2ee7d70552947fd8aacc384bd4d09';
const TREASURY = '0xb3b483c88649c930ed3cdbce07f0da89912115953a59c7aac3c48c8d64aa9342';
const DUSDC = '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC';
const BALANCE_MANAGER = '0x0b97374737d16df78ed7528d02a7a8f95c3c5235de5b023af749418bed90903b';
const PREDICT_MANAGER = '0x6ea452565c5ef3916c10f899dae0a307beb1d3dda0b59fabc08a7f315a7373ab';

const suiClient = await makeSuiClient();
const { secretKey } = decodeSuiPrivateKey(process.env.SUI_PRIVATE_KEY!);
const keypair = Ed25519Keypair.fromSecretKey(secretKey);
const address = keypair.toSuiAddress();

const tx = new Transaction();
const [opCap, rebCap] = tx.moveCall({
  target: `${PKG}::floe::create_vault`,
  typeArguments: [DUSDC],
  arguments: [
    tx.object(TREASURY),
    tx.pure.id(BALANCE_MANAGER),
    tx.pure.id(PREDICT_MANAGER),
  ],
});
// create_vault returns (OperatorCap, RebalancerCap) — transfer both to us
tx.transferObjects([opCap, rebCap], address);

const result = await suiClient.signAndExecuteTransaction({
  signer: keypair,
  transaction: tx,
  options: { showObjectChanges: true, showEffects: true },
});

console.log('Tx:', result.digest);
console.log('Explorer:', `https://suiscan.xyz/testnet/tx/${result.digest}`);
for (const c of result.objectChanges ?? []) {
  if (c.type === 'created') console.log(`  created ${c.objectType}\n    ${c.objectId}`);
}