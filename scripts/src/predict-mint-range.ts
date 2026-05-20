// scripts/src/predict-mint-range.ts
//
// Mint a vertical range position on the June 12 BTC oracle.
// The signature trade for Floe: "BTC stays in [$70k, $85k] over the next 23 days."

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
const oracleId = process.env.DEMO_ORACLE_SHORT!;       // now points to June 12 oracle

const { secretKey } = decodeSuiPrivateKey(privateKey);
const keypair = Ed25519Keypair.fromSecretKey(secretKey);
const address = keypair.toSuiAddress();
const suiClient = await makeSuiClient();

// ─── Parameters ──────────────────────────────────────────────────────────────

const ORACLE_EXPIRY = 1781251200000n;                  // June 12, 2026 08:00 UTC

const LOWER_DOLLARS = 70_000;
const UPPER_DOLLARS = 85_000;
const LOWER_STRIKE  = BigInt(LOWER_DOLLARS) * 1_000_000_000n;
const UPPER_STRIKE  = BigInt(UPPER_DOLLARS) * 1_000_000_000n;

const SIZE = 1_000_000n;                               // 1.0 unit (6dp)
const DEPOSIT_AMOUNT = 5_000_000n;                     // 5 DUSDC funding

console.log(`Sender:        ${address}`);
console.log(`Oracle:        ${oracleId}`);
console.log(`Oracle expiry: ${ORACLE_EXPIRY}`);
console.log(`Range:         $${LOWER_DOLLARS} – $${UPPER_DOLLARS}`);
console.log(`Size:          ${Number(SIZE) / 1e6} units`);
console.log(`Deposit:       ${Number(DEPOSIT_AMOUNT) / 1e6} DUSDC\n`);

// ─── Find source DUSDC ───────────────────────────────────────────────────────

const coins = await suiClient.getCoins({ owner: address, coinType: dusdcType });
const totalDusdc = coins.data.reduce((s, c) => s + BigInt(c.balance), 0n);
if (totalDusdc < DEPOSIT_AMOUNT) {
  throw new Error(`Insufficient DUSDC: have ${totalDusdc}, need ${DEPOSIT_AMOUNT}`);
}

// ─── Build PTB: deposit → make key → mint_range ──────────────────────────────

const tx = new Transaction();

const [depositCoin] = tx.splitCoins(
  tx.object(coins.data[0].coinObjectId),
  [DEPOSIT_AMOUNT],
);

tx.moveCall({
  target: `${predictPackage}::predict_manager::deposit`,
  typeArguments: [dusdcType],
  arguments: [tx.object(managerId), depositCoin],
});

const [rangeKey] = tx.moveCall({
  target: `${predictPackage}::range_key::new`,
  arguments: [
    tx.pure.id(oracleId),
    tx.pure.u64(ORACLE_EXPIRY),
    tx.pure.u64(LOWER_STRIKE),
    tx.pure.u64(UPPER_STRIKE),
  ],
});

tx.moveCall({
  target: `${predictPackage}::predict::mint_range`,
  typeArguments: [dusdcType],
  arguments: [
    tx.object(predictId),
    tx.object(managerId),
    tx.object(oracleId),
    rangeKey,
    tx.pure.u64(SIZE),
    tx.object('0x6'),
  ],
});

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

// Look for the RangeMinted event (event name should mirror PositionMinted)
const minted = result.events?.find(
  (e) => e.type.includes('::predict::RangeMinted') || e.type.includes('::predict::RangePositionMinted'),
);
if (minted) {
  console.log(`\n${minted.type.split('::').pop()} event:`);
  console.log(JSON.stringify(minted.parsedJson, null, 2));
}

if (result.balanceChanges) {
  console.log(`\nWallet balance changes:`);
  for (const c of result.balanceChanges) {
    const label = c.coinType.includes('dusdc') ? 'DUSDC' : c.coinType.slice(-12);
    console.log(`  ${label.padEnd(10)} ${c.amount}`);
  }
}

// Persist
const envPath = '.env';
let env = readFileSync(envPath, 'utf-8');
const persist = {
  DEMO_RANGE_LOWER: LOWER_STRIKE.toString(),
  DEMO_RANGE_UPPER: UPPER_STRIKE.toString(),
  DEMO_RANGE_TX: result.digest,
};
for (const [k, v] of Object.entries(persist)) {
  if (env.includes(`${k}=`)) {
    env = env.replace(new RegExp(`^${k}=.*$`, 'm'), `${k}=${v}`);
  } else {
    env += `\n${k}=${v}`;
  }
}
writeFileSync(envPath, env + '\n');
console.log('\n✓ Wrote DEMO_RANGE_* keys to .env');