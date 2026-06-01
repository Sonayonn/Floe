import { makeClients } from './engine/deepbook-clients.ts';
import { FLOE } from './config.ts';
const { sui } = makeClients();
const o = await sui.getObject({ id: FLOE.vaultId, options: { showContent: true }});
const v:any = (o.data?.content as any).fields;
console.log('plp_held:', v.plp_held, '| plp_price_cached:', v.plp_price_cached, '| updated_ms:', v.plp_price_updated_ms);
