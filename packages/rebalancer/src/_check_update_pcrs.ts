import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const NAV_PKG = '0x07677cefab304e5d27d8e2dc4aed20a6ef0f9b8bbadf25de67f61a574a658d7a';
const m: any = await sui.getNormalizedMoveModule({ package: NAV_PKG, module: 'floe_nav' });
for (const fn of ['update_pcrs','register_enclave','register_attester']) {
  const f = m.exposedFunctions?.[fn];
  if (!f) { console.log(`${fn}: NOT FOUND`); continue; }
  console.log(`\n${fn}(`);
  f.parameters.forEach((p: any, i: number) => console.log(`  [${i}]`, JSON.stringify(p)));
  console.log(`) typeParams: ${f.typeParameters?.length ?? 0}`);
}
