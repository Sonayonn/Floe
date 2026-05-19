// scripts/src/predict-manager-create.ts
import 'dotenv/config';
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { readFileSync, writeFileSync } from 'node:fs';

const privateKey = process.env.SUI_PRIVATE_KEY!;
const predictPackage = process.env.PREDICT_PACKAGE_ID!;

const { secretKey } = decodeSuiPrivateKey(privateKey);
const keypair = Ed25519Keypair.fromSecretKey(secretKey);
const address = keypair.toSuiAddress();
const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });

console.log(`Sender: ${address}`);
console.log(`Predict package: ${predictPackage}`);

const tx = new Transaction();

// create_manager returns Move type `ID` — we don't need to capture the return value;
// the new PredictManager appears in objectChanges since it's a shared object created inside the call.
tx.moveCall({
  target: `${predictPackage}::predict::create_manager`,
  arguments: [],
});

console.log('Creating PredictManager...');

const result = await suiClient.signAndExecuteTransaction({
  signer: keypair,
  transaction: tx,
  options: { showObjectChanges: true, showEffects: true },
});

console.log(`Tx digest: ${result.digest}`);
console.log(`Explorer:  https://suiscan.xyz/testnet/tx/${result.digest}`);

const managerCreated = result.objectChanges?.find(
  (c) =>
    c.type === 'created' &&
    c.objectType.includes('::predict_manager::PredictManager'),
);

if (!managerCreated || managerCreated.type !== 'created') {
  console.error('Could not find created PredictManager. Created objects:');
  console.error(
    JSON.stringify(
      result.objectChanges?.filter((c) => c.type === 'created'),
      null,
      2,
    ),
  );
  process.exit(1);
}

const managerId = managerCreated.objectId;
console.log(`PredictManager ID: ${managerId}`);
console.log(`Explorer:          https://suiscan.xyz/testnet/object/${managerId}`);

const envPath = '.env';
let env = readFileSync(envPath, 'utf-8');
if (env.includes('PREDICT_MANAGER_ID=')) {
  env = env.replace(/^PREDICT_MANAGER_ID=.*$/m, `PREDICT_MANAGER_ID=${managerId}`);
} else {
  env += `\nPREDICT_MANAGER_ID=${managerId}\n`;
}
writeFileSync(envPath, env);
console.log('✓ Wrote PREDICT_MANAGER_ID to .env');