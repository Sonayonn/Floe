// scripts/src/create-balance-manager.ts
import 'dotenv/config';
import { DeepBookClient } from '@mysten/deepbook-v3';
import { makeSuiClient } from './lib/sui.js';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import type { SuiObjectChange } from '@mysten/sui/client';
import { readFileSync, writeFileSync } from 'node:fs';

// ─── 1. Load wallet from .env ────────────────────────────────────────────────

const privateKey = process.env.SUI_PRIVATE_KEY;
if (!privateKey) throw new Error('SUI_PRIVATE_KEY missing from .env');

const { secretKey } = decodeSuiPrivateKey(privateKey);
const keypair = Ed25519Keypair.fromSecretKey(secretKey);
const address = keypair.toSuiAddress();

console.log(`Sender: ${address}`);

// ─── 2. Construct DeepBook client ────────────────────────────────────────────

const suiClient = await makeSuiClient();

const dbClient = new DeepBookClient({
  address,
  env: 'testnet',
  client: suiClient,
});

// ─── 3. Build the create-BM transaction ──────────────────────────────────────

const tx = new Transaction();
dbClient.balanceManager.createAndShareBalanceManager()(tx);

// ─── 4. Sign and submit ──────────────────────────────────────────────────────

console.log('Creating BalanceManager on testnet...');

const result = await suiClient.signAndExecuteTransaction({
  signer: keypair,
  transaction: tx,
  options: {
    showObjectChanges: true,
    showEffects: true,
  },
});

console.log(`Tx digest: ${result.digest}`);
console.log(`Explorer:  https://suiscan.xyz/testnet/tx/${result.digest}`);

// ─── 5. Extract BalanceManager object ID + persist to .env ───────────────────

const bmCreated = result.objectChanges?.find(
  (c: SuiObjectChange) =>
    c.type === 'created' &&
    c.objectType.includes('::balance_manager::BalanceManager'),
);

if (!bmCreated || bmCreated.type !== 'created') {
  console.error('Could not find created BalanceManager in objectChanges:');
  console.error(JSON.stringify(result.objectChanges, null, 2));
  process.exit(1);
}

const bmId = bmCreated.objectId;
console.log(`BalanceManager ID: ${bmId}`);
console.log(`Explorer:          https://suiscan.xyz/testnet/object/${bmId}`);

// Update .env in place
const envPath = '.env';
const envContent = readFileSync(envPath, 'utf-8');
const updated = envContent.replace(
  /^BALANCE_MANAGER_ID=.*$/m,
  `BALANCE_MANAGER_ID=${bmId}`,
);
writeFileSync(envPath, updated);
console.log(`✓ Wrote BALANCE_MANAGER_ID to .env`);