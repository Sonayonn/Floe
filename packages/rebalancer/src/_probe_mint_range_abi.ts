import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { PREDICT } from './config.ts';

const sui = new SuiClient({ url: getFullnodeUrl('testnet') });

// Pull the normalized Move module ABI for the predict package
const mods = await sui.getNormalizedMoveModulesByPackage({ package: PREDICT.packageId });

for (const fn of ['mint_range', 'supply', 'redeem_range', 'withdraw', 'mint']) {
  // find the function in whichever module defines it
  for (const [modName, mod] of Object.entries(mods)) {
    const f = (mod as any).exposedFunctions?.[fn];
    if (f) {
      console.log(`\n=== ${modName}::${fn} ===`);
      console.log('  isEntry:', f.isEntry);
      console.log('  params :', JSON.stringify(f.parameters));
      console.log('  returns:', JSON.stringify(f.return));
    }
  }
}
