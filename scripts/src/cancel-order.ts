// scripts/src/cancel-order.ts
import 'dotenv/config';
import { DeepBookClient } from '@mysten/deepbook-v3';
import { makeSuiClient } from './lib/sui.js';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';

const privateKey = process.env.SUI_PRIVATE_KEY!;
const balanceManagerId = process.env.BALANCE_MANAGER_ID!;
const orderId = process.env.LAST_ORDER_ID;

if (!orderId) throw new Error('LAST_ORDER_ID missing — run place-limit-order first');

const { secretKey } = decodeSuiPrivateKey(privateKey);
const keypair = Ed25519Keypair.fromSecretKey(secretKey);
const suiClient = await makeSuiClient();

const dbClient = new DeepBookClient({
  address: keypair.toSuiAddress(),
  env: 'testnet',
  client: suiClient,
  balanceManagers: {
    MAIN: { address: balanceManagerId, tradeCap: '' },
  },
});

console.log(`Cancelling order ${orderId}...`);

const tx = new Transaction();
dbClient.deepBook.cancelOrder('SUI_DBUSDC', 'MAIN', orderId)(tx);

const result = await suiClient.signAndExecuteTransaction({
  signer: keypair,
  transaction: tx,
  options: { showEffects: true, showEvents: true },
});

console.log(`Tx digest:  ${result.digest}`);
console.log(`Explorer:   https://suiscan.xyz/testnet/tx/${result.digest}`);