import { makeClients } from './engine/deepbook-clients.ts';
import { PREDICT } from './config.ts';
const { sui } = makeClients();

// balance_manager::new
const bmPkg = '0xfb28c4cbc6865bd1c897d26aecbe1f8792d1509a20ffec692c800660cbec6982';
const bm = await sui.getNormalizedMoveModulesByPackage({ package: bmPkg });
const bmNew = (bm['balance_manager'].exposedFunctions as any)['new'];
console.log('balance_manager::new -> returns:', JSON.stringify(bmNew.return_));

// predict::create_manager
const p = await sui.getNormalizedMoveModulesByPackage({ package: PREDICT.packageId });
const cm = (p['predict'].exposedFunctions as any)['create_manager'];
console.log('predict::create_manager -> returns:', JSON.stringify(cm.return_));
console.log('predict::create_manager -> params:', JSON.stringify(cm.parameters));
