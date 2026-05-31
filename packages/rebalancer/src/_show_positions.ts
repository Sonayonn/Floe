import { makeClients } from './engine/deepbook-clients.ts';
import { FLOE } from './config.ts';
const { sui } = makeClients();
const o = await sui.getObject({ id: FLOE.vaultId, options: { showContent: true } });
const f: any = (o.data?.content as any).fields;
const tableId = f.positions.fields.id.id;
const dyn = await sui.getDynamicFields({ parentId: tableId });
for (const d of dyn.data) {
  const fobj = await sui.getDynamicFieldObject({ parentId: tableId, name: d.name });
  const pf: any = (fobj.data?.content as any).fields.value.fields;
  console.log(`pos ${d.name.value}: size=${pf.size} premium=${pf.premium_paid} mark=${pf.mark_value_cached} strikes=${pf.lower_strike}-${pf.upper_strike}`);
}
console.log('mark_total:', f.positions_mark_total);
