import { makeClients } from './engine/deepbook-clients.ts';
const { sui } = makeClients();
const PKG = '0xfb28c4cbc6865bd1c897d26aecbe1f8792d1509a20ffec692c800660cbec6982';
const mods = await sui.getNormalizedMoveModulesByPackage({ package: PKG });
const bm = mods['balance_manager'];
console.log('=== STRUCTS ===');
for (const [name, s] of Object.entries(bm.structs as any)) {
  console.log(name, '| abilities:', (s as any).abilities.abilities.join(','));
}
console.log('\n=== FUNCTIONS (name | visibility | params -> return) ===');
for (const [name, f] of Object.entries(bm.exposedFunctions as any)) {
  const fn = f as any;
  const params = fn.parameters.map((p: any) => JSON.stringify(p)).join(', ');
  const ret = JSON.stringify(fn.return_);
  console.log(`\n${name} [${fn.visibility}${fn.isEntry ? ',entry' : ''}]`);
  console.log(`  params: ${params}`);
  console.log(`  return: ${ret}`);
}
