// scripts/src/predict-withdraw.ts
import 'dotenv/config';
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
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
const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });

// ─── Find PLP coins ──────────────────────────────────────────────────────────

const plpCoins = await suiClient.getCoins({ owner: address, coinType: plpType });
const totalPlp = plpCoins.data.reduce((s, c) => s + BigInt(c.balance), 0n);

console.log(`Sender:     ${address}`);
console.log(`Total PLP:  ${totalPlp}`);

if (totalPlp === 0n) throw new Error('No PLP to withdraw — run predict-supply first');

// Withdraw the whole PLP balance to demonstrate a full close-out
// (In real Floe, partial withdrawals are the norm — change this when productionizing)
const WITHDRAW_SHARES = totalPlp;

console.log(`Withdrawing all ${WITHDRAW_SHARES} PLP shares for DUSDC`);

// ─── Build PTB: take PLP, withdraw, transfer DUSDC back ──────────────────────

const tx = new Transaction();

// If we have a single PLP coin, use it directly. If multiple, merge first.
let lpCoinArg;
if (plpCoins.data.length === 1) {
  lpCoinArg = tx.object(plpCoins.data[0].coinObjectId);
} else {
  const [first, ...rest] = plpCoins.data;
  const firstObj = tx.object(first.coinObjectId);
  tx.mergeCoins(firstObj, rest.map((c) => tx.object(c.coinObjectId)));
  lpCoinArg = firstObj;
}

const [dusdcOut] = tx.moveCall({
  target: `${predictPackage}::predict::withdraw`,
  typeArguments: [dusdcType],
  arguments: [
    tx.object(predictId),
    lpCoinArg,
    tx.object('0x6'), // &Clock
  ],
});

tx.transferObjects([dusdcOut], tx.pure.address(address));

const result = await suiClient.signAndExecuteTransaction({
  signer: keypair,
  transaction: tx,
  options: { showEffects: true, showBalanceChanges: true, showEvents: true },
});

console.log(`\nTx digest:  ${result.digest}`);
console.log(`Explorer:   https://suiscan.xyz/testnet/tx/${result.digest}`);

const withdrawn = result.events?.find((e) => e.type.includes('::predict::Withdrawn'));
if (withdrawn) {
  console.log(`\nWithdrawn event:`);
  console.log(JSON.stringify(withdrawn.parsedJson, null, 2));
}

if (result.balanceChanges) {
  console.log(`\nWallet balance changes:`);
  for (const c of result.balanceChanges) {
    const label = c.coinType.includes('dusdc') ? 'DUSDC' :
                  c.coinType.includes('::plp::') ? 'PLP' : c.coinType.slice(-20);
    console.log(`  ${label.padEnd(10)} ${c.amount}`);
  }
}