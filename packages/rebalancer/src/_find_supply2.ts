import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const COIN='0x26b3bc67befc214058ca78ea9a2690298d731a2d4309485ec3d40198063c4abc';

// The faucet fn takes &mut <X>Supply. Read the coin modules' structs to confirm the
// Supply type names, then we locate the shared objects. Shared objects of a known type
// can't be enumerated by type via JSON-RPC directly, BUT the faucet module often exposes
// the Supply as a single well-known shared object created at init. Cleanest: read the
// package's modules and check if any module has an `init`-created shared Supply we can
// derive, OR check the faucet_amount view + look for a getter.
const mods = await sui.getNormalizedMoveModulesByPackage({ package: COIN });
for (const m of ['usdc','eth','usdt','cetus','btc']) {
  const mod = (mods as any)[m];
  if (!mod) continue;
  const structs = Object.keys(mod.structs ?? {});
  console.log(`${m}: structs = ${structs.join(', ')}`);
}
