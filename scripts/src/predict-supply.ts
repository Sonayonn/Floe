// scripts/src/predict-supply.ts
import 'dotenv/config';
import { makeSuiClient } from './lib/sui.js';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';

const privateKey = process.env.SUI_PRIVATE_KEY!;
const predictPackage = process.env.PREDICT_PACKAGE_ID!;
const predictId = process.env.PREDICT_OBJECT_ID!;
const dusdcType = process.env.PREDICT_QUOTE_TYPE!;
const plpType = process.env.PREDICT_PLP_TYPE!;

const { secretKey } = decodeSuiPrivateKey(privateKey);
const keypair = Ed25519Keypair.fromSecretKey(secretKey);
const address = keypair.toSuiAddress();
const suiClient = await makeSuiClient();

// LP 10 DUSDC. With 6 decimals, that's 10_000_000 base units.
const SUPPLY_AMOUNT_BASE = 10_000_000n;

// ─── Find a DUSDC coin owned by us with enough balance ───────────────────────

const coins = await suiClient.getCoins({ owner: address, coinType: dusdcType });
const totalDusdc = coins.data.reduce((sum, c) => sum + BigInt(c.balance), 0n);

console.log(`Sender:        ${address}`);
console.log(`Total DUSDC:   ${totalDusdc} base units (${Number(totalDusdc) / 1e6} DUSDC)`);
console.log(`Supplying:     ${SUPPLY_AMOUNT_BASE} (${Number(SUPPLY_AMOUNT_BASE) / 1e6} DUSDC)`);

if (totalDusdc < SUPPLY_AMOUNT_BASE) {
  throw new Error(`Insufficient DUSDC: have ${totalDusdc}, need ${SUPPLY_AMOUNT_BASE}`);
}

// ─── Build the PTB: split off exact amount, supply, transfer PLP back ────────

const tx = new Transaction();

// Use the largest coin as the source; if amount > one coin's balance, merge first.
// For 10 DUSDC out of our 100, one coin is more than enough.
const primaryCoinId = coins.data[0].coinObjectId;

const [splitCoin] = tx.splitCoins(tx.object(primaryCoinId), [SUPPLY_AMOUNT_BASE]);

// supply<DUSDC>(predict, coin, clock, ctx) -> Coin<PLP>
const [plpCoin] = tx.moveCall({
  target: `${predictPackage}::predict::supply`,
  typeArguments: [dusdcType],
  arguments: [
    tx.object(predictId),          // &mut Predict
    splitCoin,                      // Coin<DUSDC>
    tx.object('0x6'),               // &Clock (system clock)
  ],
});

// Transfer PLP to our address (composable pattern)
tx.transferObjects([plpCoin], tx.pure.address(address));

const result = await suiClient.signAndExecuteTransaction({
  signer: keypair,
  transaction: tx,
  options: { showEffects: true, showBalanceChanges: true, showEvents: true },
});

console.log(`\nTx digest:  ${result.digest}`);
console.log(`Explorer:   https://suiscan.xyz/testnet/tx/${result.digest}`);

// Find the Supplied event for the share count
const supplied = result.events?.find((e) => e.type.includes('::predict::Supplied'));
if (supplied) {
  console.log(`\nSupplied event:`);
  console.log(JSON.stringify(supplied.parsedJson, null, 2));
}

// Show balance changes
if (result.balanceChanges) {
  console.log(`\nWallet balance changes:`);
  for (const c of result.balanceChanges) {
    const label = c.coinType.includes('dusdc') ? 'DUSDC' :
                  c.coinType.includes('::plp::') ? 'PLP' : c.coinType.slice(-20);
    console.log(`  ${label.padEnd(10)} ${c.amount}`);
  }
}

// Find the new PLP coin object ID for the next withdraw script
const plpCoins = await suiClient.getCoins({ owner: address, coinType: plpType });
if (plpCoins.data.length > 0) {
  console.log(`\nPLP coins owned:`);
  for (const c of plpCoins.data) {
    console.log(`  ${c.coinObjectId} → balance ${c.balance}`);
  }
}