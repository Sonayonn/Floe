import { makeClients } from './engine/deepbook-clients.ts';
import { FLOE, PREDICT } from './config.ts';
const { sui, address } = makeClients();
const PLP = PREDICT.plpType;

// vault's held PLP (read the Balance<PLP> dynamic field value)
const dfs = await sui.getDynamicFields({ parentId: FLOE.vaultId });
for (const d of dfs.data) {
  if (d.objectType.includes('::plp::PLP')) {
    const obj = await sui.getDynamicFieldObject({ parentId: FLOE.vaultId, name: d.name });
    const v = (obj.data?.content as any)?.fields;
    console.log('VAULT PLP (dynamic field):', JSON.stringify(v));
  }
}
// EOA PLP — confirm it's the OLD leak (unchanged by this tx)
const eoaPlp = await sui.getCoins({ owner: address, coinType: PLP });
console.log('EOA PLP coins:', eoaPlp.data.map(c => ({ id: c.coinObjectId.slice(0,10), bal: c.balance })));
