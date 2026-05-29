import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { FLOE } from './config';

const client = new SuiClient({ url: getFullnodeUrl('testnet') });
const obj = await client.getObject({
  id: FLOE.vaultId,
  options: { showContent: true, showType: true },
});

console.log('Type:', obj.data?.type);
const f = (obj.data?.content as any)?.fields ?? {};
console.log({
  share_supply: f.share_supply,
  paused: f.paused,
  plp_held: f.plp_held,
  position_count: f.position_count,
  plp_floor_bps: f.plp_floor_bps,
  positions_mark_total: f.positions_mark_total,
});
