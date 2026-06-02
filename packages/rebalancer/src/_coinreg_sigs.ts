import { makeClients } from './engine/deepbook-clients.ts';
const { sui } = makeClients();
const fw = await sui.getNormalizedMoveModulesByPackage({ package: '0x0000000000000000000000000000000000000000000000000000000000000002' });
const cr = (fw as any)['coin_registry'];
for (const fn of ['new_currency_with_otw','finalize','finalize_registration']) {
  const f = (cr.exposedFunctions as any)[fn];
  console.log(`\n=== ${fn} [${f.visibility}${f.isEntry?',entry':''}] ===`);
  f.parameters.forEach((p:any,i:number)=>console.log(`  param[${i}]:`, JSON.stringify(p)));
  console.log('  returns:', JSON.stringify(f.return_));
}
// also dump the CurrencyInitializer + Currency structs if present
console.log('\n=== structs ===');
for (const [n,s] of Object.entries(cr.structs as any)) {
  console.log(n, '| abilities:', (s as any).abilities.abilities.join(','), '| fields:', (s as any).fields.map((x:any)=>x.name).join(','));
}
