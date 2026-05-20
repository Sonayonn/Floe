// scripts/src/check-pool.ts
import 'dotenv/config';
import { DeepBookClient } from '@mysten/deepbook-v3';
import { makeSuiClient } from './lib/sui.js';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

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

// Mid-price across the book
const midPrice = await dbClient.midPrice(POOL_KEY);
console.log(`SUI/DBUSDC mid-price:  ${midPrice}`);

// Top-of-book — wrapped because the SDK crashes on empty book ranges
// (a known bug in @mysten/deepbook-v3 0.28.3: non-null assertion on undefined result)
try {
  const bids = await dbClient.getLevel2Range(POOL_KEY, 0.5, 2, true);
  console.log(`Bid prices (top 5):  `, bids.prices.slice(0, 5));
  console.log(`Bid sizes  (top 5):  `, bids.quantities.slice(0, 5));
} catch {
  console.log(`Bid side empty or unreadable (SDK crash on empty result)`);
}

try {
  const asks = await dbClient.getLevel2Range(POOL_KEY, 0.5, 2, false);
  console.log(`Ask prices (top 5):  `, asks.prices.slice(0, 5));
  console.log(`Ask sizes  (top 5):  `, asks.quantities.slice(0, 5));
} catch {
  console.log(`Ask side empty or unreadable (SDK crash on empty result)`);
}

// Pool trade params — taker/maker fee and DEEP stake requirement
const params = await dbClient.poolTradeParams(POOL_KEY);
console.log(`Trade params:`, params);

// Is the pool whitelisted? (whitelisted = 0% fees, no DEEP required)
const whitelisted = await dbClient.whitelisted(POOL_KEY);
console.log(`Whitelisted:          ${whitelisted}`);