import { makeClients } from './engine/deepbook-clients.ts';
const { sui } = makeClients();
const PKG = '0xfb28c4cbc6865bd1c897d26aecbe1f8792d1509a20ffec692c800660cbec6982';
const mods = await sui.getNormalizedMoveModulesByPackage({ package: PKG });
const bm = mods['balance_manager'];
for (const fn of ['mint_withdraw_cap', 'mint_deposit_cap', 'mint_trade_cap', 'new', 'new_with_custom_owner']) {
  const f = (bm.exposedFunctions as any)[fn];
  if (f) console.log(`${fn}: params=${JSON.stringify(f.parameters)} returns=${JSON.stringify(f.return_)}`);
  else console.log(`${fn}: (not found)`);
}
