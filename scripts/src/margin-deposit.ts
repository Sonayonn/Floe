// scripts/src/margin-deposit.ts
import 'dotenv/config';
import { DeepBookClient } from '@mysten/deepbook-v3';
import { makeSuiClient } from './lib/sui.js';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';

const privateKey = process.env.SUI_PRIVATE_KEY!;
const balanceManagerId = process.env.BALANCE_MANAGER_ID!;
const marginManagerId = process.env.MARGIN_MANAGER_ID!;

if (!marginManagerId) {
  throw new Error('MARGIN_MANAGER_ID missing — run margin-open first');
}

const { secretKey } = decodeSuiPrivateKey(privateKey);
const keypair = Ed25519Keypair.fromSecretKey(secretKey);
const suiClient = await makeSuiClient();

const MANAGER_KEY = 'MAIN';
const MARGIN_KEY = 'MARGIN_MAIN';
const POOL_KEY = 'SUI_DBUSDC';

const dbClient = new DeepBookClient({
  address: keypair.toSuiAddress(),
  env: 'testnet',
  client: suiClient,
  balanceManagers: {
    [MANAGER_KEY]: { address: balanceManagerId, tradeCap: '' },
  },
  marginManagers: {
    [MARGIN_KEY]: { address: marginManagerId, poolKey: POOL_KEY },
  },
} as any);

console.log(`MarginManager:  ${marginManagerId}`);
console.log(`Pool:           ${POOL_KEY}`);

// ─── Deposit 5 DBUSDC into the MarginManager as quote ────────────────────────

const DEPOSIT_AMOUNT = 5; // DBUSDC

console.log(`\nDepositing ${DEPOSIT_AMOUNT} DBUSDC as quote collateral...`);

// ─── Introspect the actual function shape before calling ─────────────────────

const depositQuoteFn = dbClient.marginManager.depositQuote;
console.log(`\ndepositQuote.length (expected arg count): ${depositQuoteFn.length}`);
console.log(`depositQuote source:\n${depositQuoteFn.toString().slice(0, 500)}`);

// ─── Best-guess call: params-object form, matches placeLimitOrder pattern ────

const tx = new Transaction();

dbClient.marginManager.depositQuote({
  managerKey: MARGIN_KEY,
  amount: DEPOSIT_AMOUNT,
})(tx);

const result = await suiClient.signAndExecuteTransaction({
  signer: keypair,
  transaction: tx,
  options: { showEffects: true, showBalanceChanges: true },
});

console.log(`Tx digest:      ${result.digest}`);
console.log(`Explorer:       https://suiscan.xyz/testnet/tx/${result.digest}`);

if (result.balanceChanges) {
  console.log('\nWallet balance changes:');
  for (const c of result.balanceChanges) {
    console.log(`  ${c.coinType.slice(-12)}: ${c.amount}`);
  }
}