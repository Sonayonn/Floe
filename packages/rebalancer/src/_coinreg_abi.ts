import { makeClients } from './engine/deepbook-clients.ts';
const { sui } = makeClients();
// coin_registry is in the Sui framework at 0x2
const mods = await sui.getNormalizedMoveModulesByPackage({ package: '0x000000000000000000000000000000000000000000000000000000000000000b' }).catch(() => null);
// coin_registry may be at 0x2 (framework). Try 0x2 first.
const fw = await sui.getNormalizedMoveModulesByPackage({ package: '0x0000000000000000000000000000000000000000000000000000000000000002' });
const cr = (fw as any)['coin_registry'];
if (!cr) { console.log('coin_registry NOT in 0x2; modules:', Object.keys(fw).slice(0,40)); }
else {
  for (const fn of ['new_currency_with_otw','finalize','finalize_registration','new_currency']) {
    const f = (cr.exposedFunctions as any)[fn];
    console.log(fn, f ? 'EXISTS: '+JSON.stringify(f.parameters?.length)+' params, returns '+JSON.stringify(f.return_) : '(not found)');
  }
}
