// scripts/src/place-limit-order.ts
import 'dotenv/config';
import { DeepBookClient } from '@mysten/deepbook-v3';
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { readFileSync, writeFileSync } from 'node:fs';

const privateKey = process.env.SUI_PRIVATE_KEY!;
const balanceManagerId = process.env.BALANCE_MANAGER_ID!;

const { secretKey } = decodeSuiPrivateKey(privateKey);
const keypair = Ed25519Keypair.fromSecretKey(secretKey);
const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });

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

// ─── Place a buy bid 30% below mid — well off market, so it just rests ───────

const midPrice = await dbClient.midPrice(POOL_KEY);
const bidPrice = +(midPrice * 0.7).toFixed(3);
const quantity = 1; // buy 1 SUI

console.log(`Mid:    ${midPrice}`);
console.log(`Bid:    ${bidPrice} DBUSDC per SUI (30% below mid)`);
console.log(`Size:   ${quantity} SUI`);

const tx = new Transaction();
dbClient.deepBook.placeLimitOrder({
  poolKey: POOL_KEY,
  balanceManagerKey: MANAGER_KEY,
  clientOrderId: Date.now().toString(),
  price: bidPrice,
  quantity,
  isBid: true,
  payWithDeep: false,
})(tx);

const result = await suiClient.signAndExecuteTransaction({
  signer: keypair,
  transaction: tx,
  options: { showEffects: true, showEvents: true },
});

console.log(`\nTx digest:  ${result.digest}`);
console.log(`Explorer:   https://suiscan.xyz/testnet/tx/${result.digest}`);

// ─── Extract the order ID from events for cancel-order to reuse ──────────────

const orderPlacedEvent = result.events?.find((e) =>
  e.type.includes('OrderPlaced'),
);

if (orderPlacedEvent) {
  const orderData = orderPlacedEvent.parsedJson as any;
  const orderId = orderData?.order_id ?? orderData?.orderId;
  console.log(`Order ID:   ${orderId}`);

  // Persist to .env for cancel-order.ts
  const envPath = '.env';
  let env = readFileSync(envPath, 'utf-8');
  if (env.includes('LAST_ORDER_ID=')) {
    env = env.replace(/^LAST_ORDER_ID=.*$/m, `LAST_ORDER_ID=${orderId}`);
  } else {
    env += `\nLAST_ORDER_ID=${orderId}\n`;
  }
  writeFileSync(envPath, env);
  console.log(`✓ Wrote LAST_ORDER_ID to .env`);
}