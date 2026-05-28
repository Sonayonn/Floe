import 'dotenv/config';
import { DeepBookClient } from '@mysten/deepbook-v3';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';

const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });
const address = '0x9a249cb07dbe8bbdf4b880255c72ed103a995bd390a72903b26797f51e366216';
const db = new DeepBookClient({ address, env: 'testnet', client: suiClient });

const cfg = (db as any)._config ?? (db as any).config ?? (db as any).marginManager?.['#config'];

// Dump coin configs to see priceInfoObjectId fields
console.log('=== Coins in config ===');
const coins = (db as any).balanceManager?.['#config']?.coins
  ?? (db as any).deepBook?.['#config']?.coins;
try {
  const c = (db as any).deepBook;
  console.log('config keys:', Object.keys(c?.['#config'] ?? {}));
} catch (e) { console.log('introspect err', e); }

// Try the documented config access
for (const key of ['SUI','DBUSDC','DEEP','USDC']) {
  try {
    const coin = (db as any).deepBook?.['#config']?.getCoin?.(key);
    console.log(key, '->', coin);
  } catch (e: any) { console.log(key, 'err', e.message); }
}
