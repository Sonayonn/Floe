// scripts/src/margin-open.ts
import 'dotenv/config';
import { DeepBookClient } from '@mysten/deepbook-v3';
import { makeSuiClient } from './lib/sui.js';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { readFileSync, writeFileSync } from 'node:fs';

const privateKey = process.env.SUI_PRIVATE_KEY!;
const balanceManagerId = process.env.BALANCE_MANAGER_ID!;

const { secretKey } = decodeSuiPrivateKey(privateKey);
const keypair = Ed25519Keypair.fromSecretKey(secretKey);
const suiClient = await makeSuiClient();

const MANAGER_KEY = 'MAIN';
const POOL_KEY = 'SUI_DBUSDC';

const dbClient = new DeepBookClient({
  address: keypair.toSuiAddress(),
  env: 'testnet',
  client: suiClient,
  balanceManagers: {
    [MANAGER_KEY]: { address: balanceManagerId, tradeCap: '' },
  },
});

// Inspect what the margin namespace exposes so we know which functions exist
console.log('Margin SDK methods available:');
console.log(Object.keys(dbClient).filter((k) => k.toLowerCase().includes('margin')));
if ((dbClient as any).margin) {
  console.log(Object.keys((dbClient as any).margin));
}

console.log('Creating MarginManager for pool', POOL_KEY, '...');

const tx = new Transaction();
dbClient.marginManager.newMarginManager(POOL_KEY)(tx);

const result = await suiClient.signAndExecuteTransaction({
  signer: keypair,
  transaction: tx,
  options: { showObjectChanges: true, showEffects: true },
});

console.log(`Tx digest:  ${result.digest}`);
console.log(`Explorer:   https://suiscan.xyz/testnet/tx/${result.digest}`);

// Find the created MarginManager
const created = result.objectChanges?.find(
  (c) =>
    c.type === 'created' &&
    c.objectType.toLowerCase().includes('marginmanager'),
);

if (!created || created.type !== 'created') {
  console.error('No MarginManager found in objectChanges. Dumping all created objects:');
  console.error(
    JSON.stringify(
      result.objectChanges?.filter((c) => c.type === 'created'),
      null,
      2,
    ),
  );
  process.exit(1);
}

const mmId = created.objectId;
console.log(`MarginManager ID: ${mmId}`);

// Persist
const envPath = '.env';
let env = readFileSync(envPath, 'utf-8');
if (env.includes('MARGIN_MANAGER_ID=')) {
  env = env.replace(/^MARGIN_MANAGER_ID=.*$/m, `MARGIN_MANAGER_ID=${mmId}`);
} else {
  env += `\nMARGIN_MANAGER_ID=${mmId}\n`;
}
writeFileSync(envPath, env);
console.log('✓ Wrote MARGIN_MANAGER_ID to .env');