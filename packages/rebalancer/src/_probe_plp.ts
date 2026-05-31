import { makeClients } from './engine/deepbook-clients.ts';
import { PREDICT } from './config.ts';
const { sui } = makeClients();
const o = await sui.getObject({ id: PREDICT.objectId, options: { showContent: true } });
const f = (o.data?.content as any)?.fields ?? {};
console.log('Predict fields:', Object.keys(f));
console.log(JSON.stringify(f, null, 2).slice(0, 2000));
