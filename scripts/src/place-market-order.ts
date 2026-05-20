// scripts/src/place-market-order.ts
import 'dotenv/config';
import { DeepBookClient } from '@mysten/deepbook-v3';
import { makeSuiClient } from './lib/sui.js';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';

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

// Query the pool's structural parameters first — abort cause was likely
// an invalid quantity (below min_size or unaligned to lot_size).
const bookParams = await (dbClient as any).bookParams?.(POOL_KEY).catch(() => null);
const poolParams = (dbClient as any).poolBookParams
  ? await (dbClient as any).poolBookParams(POOL_KEY)
  : bookParams;
console.log(`Pool book params:`, poolParams);

// Pull the trade params too for context
const tradeParams = await dbClient.poolTradeParams(POOL_KEY);
console.log(`Pool trade params:`, tradeParams);

console.log(`\nBefore:`, await dbClient.checkManagerBalance(MANAGER_KEY, 'SUI'));
console.log(`Before:`, await dbClient.checkManagerBalance(MANAGER_KEY, 'DBUSDC'));

// Market buy 1 SUI using DBUSDC — bumped from 0.5 to clear the minimum.
// If 1 still aborts, the lot_size from bookParams will tell us the right value.
const tx = new Transaction();
dbClient.deepBook.placeMarketOrder({
  poolKey: POOL_KEY,
  balanceManagerKey: MANAGER_KEY,
  clientOrderId: Date.now().toString(),
  quantity: 1,
  isBid: true,
  payWithDeep: false,
})(tx);

const result = await suiClient.signAndExecuteTransaction({
  signer: keypair,
  transaction: tx,
  options: { showEffects: true, showEvents: true, showBalanceChanges: true },
});

console.log(`\nTx digest:  ${result.digest}`);
console.log(`Explorer:   https://suiscan.xyz/testnet/tx/${result.digest}`);

console.log(`\nAfter:`, await dbClient.checkManagerBalance(MANAGER_KEY, 'SUI'));
console.log(`After:`, await dbClient.checkManagerBalance(MANAGER_KEY, 'DBUSDC'));