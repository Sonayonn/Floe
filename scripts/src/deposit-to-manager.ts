// scripts/src/deposit-to-manager.ts
import 'dotenv/config';
import { DeepBookClient } from '@mysten/deepbook-v3';
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';

// ─── 1. Load wallet + BalanceManager ─────────────────────────────────────────

const privateKey = process.env.SUI_PRIVATE_KEY;
const balanceManagerId = process.env.BALANCE_MANAGER_ID;

if (!privateKey) throw new Error('SUI_PRIVATE_KEY missing from .env');
if (!balanceManagerId) throw new Error('BALANCE_MANAGER_ID missing from .env');

const { secretKey } = decodeSuiPrivateKey(privateKey);
const keypair = Ed25519Keypair.fromSecretKey(secretKey);
const address = keypair.toSuiAddress();

console.log(`Sender:          ${address}`);
console.log(`BalanceManager:  ${balanceManagerId}`);

// ─── 2. Construct DeepBookClient with the BM registered ──────────────────────

const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });

const MANAGER_KEY = 'MAIN';

const dbClient = new DeepBookClient({
  address,
  env: 'testnet',
  client: suiClient,
  balanceManagers: {
    [MANAGER_KEY]: {
      address: balanceManagerId,
      tradeCap: '', // none yet; owner doesn't need one
    },
  },
});

// ─── 3. Build a single PTB that deposits both coins ──────────────────────────

const tx = new Transaction();

// Amounts in standard decimal format (SDK handles unit conversion internally).
// DBUSDC has 6 decimals; SUI has 9.
const DEPOSIT_SUI = 0.5;       // 0.5 SUI for fees + balance to trade
const DEPOSIT_DBUSDC = 50;     // 50 DBUSDC for the trade legs

dbClient.balanceManager.depositIntoManager(MANAGER_KEY, 'SUI', DEPOSIT_SUI)(tx);
dbClient.balanceManager.depositIntoManager(MANAGER_KEY, 'DBUSDC', DEPOSIT_DBUSDC)(tx);

console.log(`Depositing ${DEPOSIT_SUI} SUI and ${DEPOSIT_DBUSDC} DBUSDC...`);

// ─── 4. Sign and execute ─────────────────────────────────────────────────────

const result = await suiClient.signAndExecuteTransaction({
  signer: keypair,
  transaction: tx,
  options: {
    showObjectChanges: true,
    showEffects: true,
    showBalanceChanges: true,
  },
});

console.log(`Tx digest:       ${result.digest}`);
console.log(`Explorer:        https://suiscan.xyz/testnet/tx/${result.digest}`);

// ─── 5. Read back BM balances ────────────────────────────────────────────────

console.log('\nBalanceManager balances after deposit:');
const suiBalance = await dbClient.checkManagerBalance(MANAGER_KEY, 'SUI');
const dbusdcBalance = await dbClient.checkManagerBalance(MANAGER_KEY, 'DBUSDC');

console.log(`  SUI:    ${JSON.stringify(suiBalance)}`);
console.log(`  DBUSDC: ${JSON.stringify(dbusdcBalance)}`);