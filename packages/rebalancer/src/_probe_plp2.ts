import { makeClients } from './engine/deepbook-clients.ts';
import { PREDICT } from './config.ts';
const { sui } = makeClients();
const o = await sui.getObject({ id: PREDICT.objectId, options: { showContent: true } });
const f = (o.data?.content as any)?.fields ?? {};
// hunt for anything that looks like a pooled value / reserve / liquidity balance
function walk(obj: any, path = ''): void {
  if (obj && typeof obj === 'object') {
    for (const k of Object.keys(obj)) {
      const p = path ? `${path}.${k}` : k;
      const v = obj[k];
      if (/value|balance|reserve|liquidity|vault|pool|total|deposit/i.test(k) && (typeof v === 'string' || typeof v === 'number')) {
        console.log(`${p} = ${v}`);
      }
      if (v && typeof v === 'object') walk(v, p);
    }
  }
}
walk(f);
console.log('--- top-level keys ---', Object.keys(f));
