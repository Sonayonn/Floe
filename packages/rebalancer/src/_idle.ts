import { makeClients } from './engine/deepbook-clients.ts';
import { FLOE } from './config.ts';
const { sui } = makeClients();
const o = await sui.getObject({ id: FLOE.vaultId, options: { showContent: true } });
const f: any = (o.data?.content as any).fields;
console.log('idle(6dp):', f.idle, '=>', Number(f.idle) / 1e6, 'DUSDC');
