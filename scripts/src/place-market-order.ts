// scripts/src/place-market-order.ts
import 'dotenv/config';
import { DeepBookClient } from '@mysten/deepbook-v3';
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';

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

console.log(`Before:`, await dbClient.checkManagerBalance(MANAGER_KEY, 'SUI'));
console.log(`Before:`, await dbClient.checkManagerBalance(MANAGER_KEY, 'DBUSDC'));

// Tiny market buy of 0.5 SUI using DBUSDC
const tx = new Transaction();
dbClient.deepBook.placeMarketOrder({
  poolKey: POOL_KEY,
  balanceManagerKey: MANAGER_KEY,
  clientOrderId: Date.now().toString(),
  quantity: 0.5,
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