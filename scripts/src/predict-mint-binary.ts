// scripts/src/predict-mint-binary.ts
import 'dotenv/config';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { makeSuiClient } from './lib/sui.js';
import { readFileSync, writeFileSync } from 'node:fs';

const privateKey = process.env.SUI_PRIVATE_KEY!;
const predictPackage = process.env.PREDICT_PACKAGE_ID!;
const predictId = process.env.PREDICT_OBJECT_ID!;
const managerId = process.env.PREDICT_MANAGER_ID!;
const dusdcType = process.env.PREDICT_QUOTE_TYPE!;
const oracleId = process.env.DEMO_ORACLE_SHORT!;

const { secretKey } = decodeSuiPrivateKey(privateKey);
const keypair = Ed25519Keypair.fromSecretKey(secretKey);
const address = keypair.toSuiAddress();
const suiClient = await makeSuiClient();

// ─── Parameters ──────────────────────────────────────────────────────────────

// Oracle's stored expiry (from /oracles/<id>/state — short oracle is 15:45 UTC)
const ORACLE_EXPIRY = 1781251200000n;            // June 12, 2026 08:00 UTC

const STRIKE_DOLLARS = 77_000;
const STRIKE = BigInt(STRIKE_DOLLARS) * 1_000_000_000n;
const IS_BULL = true;

const SIZE = 1_000_000n;                          // 1 unit (6 dp)
const DEPOSIT_AMOUNT = 5_000_000n;                // 5 DUSDC for premium + slack

console.log(`Sender:          ${address}`);
console.log(`Oracle:          ${oracleId}`);
console.log(`Oracle expiry:   ${ORACLE_EXPIRY}`);
console.log(`Strike:          $${STRIKE_DOLLARS} (BULL = ${IS_BULL})`);
console.log(`Size:            ${Number(SIZE) / 1e6} units`);
console.log(`Deposit:         ${Number(DEPOSIT_AMOUNT) / 1e6} DUSDC into PredictManager\n`);

// ─── Find DUSDC source coin ──────────────────────────────────────────────────

const coins = await suiClient.getCoins({ owner: address, coinType: dusdcType });
const totalDusdc = coins.data.reduce((s, c) => s + BigInt(c.balance), 0n);
if (totalDusdc < DEPOSIT_AMOUNT) {
  throw new Error(`Insufficient DUSDC: have ${totalDusdc}, need ${DEPOSIT_AMOUNT}`);
}

// ─── Build PTB: deposit → make key → mint, all atomic ────────────────────────

const tx = new Transaction();

// 1) Split off exact deposit amount from our DUSDC
const primaryCoin = coins.data[0].coinObjectId;
const [depositCoin] = tx.splitCoins(tx.object(primaryCoin), [DEPOSIT_AMOUNT]);

// 2) Deposit into the PredictManager — funds the upcoming mint
tx.moveCall({
  target: `${predictPackage}::predict_manager::deposit`,
  typeArguments: [dusdcType],
  arguments: [
    tx.object(managerId),
    depositCoin,
  ],
});

// 3) Construct the MarketKey: (oracle_id, expiry, strike, is_bull)
const [marketKey] = tx.moveCall({
  target: `${predictPackage}::market_key::new`,
  arguments: [
    tx.pure.id(oracleId),
    tx.pure.u64(ORACLE_EXPIRY),
    tx.pure.u64(STRIKE),
    tx.pure.bool(IS_BULL),
  ],
});

// 4) Mint the binary position — debits the PredictManager's internal balance
tx.moveCall({
  target: `${predictPackage}::predict::mint`,
  typeArguments: [dusdcType],
  arguments: [
    tx.object(predictId),
    tx.object(managerId),
    tx.object(oracleId),
    marketKey,
    tx.pure.u64(SIZE),
    tx.object('0x6'),
  ],
});

// ─── Execute ─────────────────────────────────────────────────────────────────

console.log('Submitting PTB...\n');
const result = await suiClient.signAndExecuteTransaction({
  signer: keypair,
  transaction: tx,
  options: {
    showEffects: true,
    showEvents: true,
    showBalanceChanges: true,
    showObjectChanges: true,
  },
});

console.log(`Tx digest:  ${result.digest}`);
console.log(`Explorer:   https://suiscan.xyz/testnet/tx/${result.digest}`);

if (result.effects?.status?.status !== 'success') {
  console.error(`\nTx FAILED: ${result.effects?.status?.error}`);
  process.exit(1);
}

// PositionMinted event captures the actual premium paid
const minted = result.events?.find((e) => e.type.includes('::predict::PositionMinted'));
if (minted) {
  console.log(`\nPositionMinted event:`);
  console.log(JSON.stringify(minted.parsedJson, null, 2));
}

// Balance changes
if (result.balanceChanges) {
  console.log(`\nWallet balance changes:`);
  for (const c of result.balanceChanges) {
    const label = c.coinType.includes('dusdc') ? 'DUSDC' : c.coinType.slice(-12);
    console.log(`  ${label.padEnd(10)} ${c.amount}`);
  }
}

// Persist the market key components for the redeem script later
const envPath = '.env';
let env = readFileSync(envPath, 'utf-8');
const replacements = {
  DEMO_BINARY_STRIKE: STRIKE.toString(),
  DEMO_BINARY_IS_BULL: String(IS_BULL),
  DEMO_BINARY_TX: result.digest,
};
for (const [k, v] of Object.entries(replacements)) {
  if (env.includes(`${k}=`)) {
    env = env.replace(new RegExp(`^${k}=.*$`, 'm'), `${k}=${v}`);
  } else {
    env += `\n${k}=${v}`;
  }
}
writeFileSync(envPath, env + '\n');
console.log('\n✓ Wrote DEMO_BINARY_* keys to .env');