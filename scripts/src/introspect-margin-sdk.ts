import 'dotenv/config';
import { DeepBookClient } from '@mysten/deepbook-v3';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';

const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });
const address = '0x9a249cb07dbe8bbdf4b880255c72ed103a995bd390a72903b26797f51e366216';
const db = new DeepBookClient({ address, env: 'testnet', client: suiClient });

function allMethods(obj: any): string[] {
  const out = new Set<string>();
  // own properties (incl. arrow-fn methods assigned in constructor)
  for (const k of Object.getOwnPropertyNames(obj)) {
    if (typeof obj[k] === 'function') out.add(k);
  }
  // walk prototype chain
  let proto = Object.getPrototypeOf(obj);
  while (proto && proto !== Object.prototype) {
    for (const k of Object.getOwnPropertyNames(proto)) {
      if (k !== 'constructor' && typeof obj[k] === 'function') out.add(k);
    }
    proto = Object.getPrototypeOf(proto);
  }
  return [...out].sort();
}

for (const ns of ['marginManager', 'marginPool', 'marginRegistry', 'marginAdmin']) {
  const o = (db as any)[ns];
  console.log(`\n=== ${ns} ===`);
  console.log(o ? allMethods(o) : 'undefined');
}
