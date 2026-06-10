import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const ENCLAVE_PKG = '0x8ecf22e78c90c3e32833d76d82415d7e4227ea370bec4efdad4c4830cbda9e49';
// list modules in the enclave package
const pkg: any = await sui.getNormalizedMoveModulesByPackage({ package: ENCLAVE_PKG });
for (const [modName, mod] of Object.entries<any>(pkg)) {
  const fns = Object.keys(mod.exposedFunctions ?? {});
  console.log(`\n=== module ${modName} ===`);
  console.log(fns.join(', '));
}
