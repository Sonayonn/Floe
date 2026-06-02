import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
const sui = new SuiClient({ url: getFullnodeUrl('testnet') });

async function probePkg(label: string, pkg: string) {
  try {
    const mods = await sui.getNormalizedMoveModulesByPackage({ package: pkg });
    console.log(`✓ ${label}: LIVE on testnet — modules: ${Object.keys(mods).slice(0,8).join(', ')}`);
    return mods;
  } catch (e:any) {
    console.log(`✗ ${label}: NOT live (${String(e.message||e).slice(0,50)})`);
    return null;
  }
}
async function probeObj(label: string, id: string) {
  try {
    const o = await sui.getObject({ id, options: { showType: true } });
    if (o.data) console.log(`✓ ${label}: exists — type ${String(o.data.type).slice(0,70)}`);
    else console.log(`✗ ${label}: no data (${JSON.stringify(o.error).slice(0,50)})`);
  } catch (e:any) { console.log(`✗ ${label}: err ${String(e.message||e).slice(0,50)}`); }
}

console.log('=== Cetus CLMM testnet ===');
const cetus = await probePkg('Cetus clmm pkg 0xf5ff7d5b', '0xf5ff7d5ba73b581bca6b4b9fa0049cd320360abd154b809f8700a8fd3cfaf7ca');
await probeObj('Cetus testnet pool 0xbed3136f', '0xbed3136f15b0ea649fb94bcdf9d3728fb82ba1c3e189bf6062d78ff547850054');

console.log('\n=== If Cetus pkg is live, show pool/position module functions ===');
if (cetus && (cetus as any)['pool']) {
  const fns = Object.keys(((cetus as any)['pool'].exposedFunctions) ?? {});
  console.log('  pool fns:', fns.filter(f => /liquidit|open_position|swap/.test(f)).slice(0,10).join(', '));
}
