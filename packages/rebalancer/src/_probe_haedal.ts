import { SuiClient } from '@mysten/sui/client';
const sui = new SuiClient({ url: process.env.SUI_RPC_URL! });

// Haedal mainnet staking package (well-known). Probe it on TESTNET (likely absent).
const HAEDAL_MAINNET = '0x3f45767c1aa95b25422f675800f02d8a813ec793a00b60667d071a77ba7178a2';
// haSUI mainnet coin type pkg
const HASUI_MAINNET = '0xbde4ba4c2e274a60ce15c1cfff9e5c42e41654ac8b6d906a57efa4bd3c29f47d';

for (const [label, id] of [
  ['Haedal staking pkg (mainnet id on testnet)', HAEDAL_MAINNET],
  ['haSUI coin pkg (mainnet id on testnet)', HASUI_MAINNET],
] as const) {
  try {
    const mods = await sui.getNormalizedMoveModulesByPackage({ package: id });
    console.log(`✓ ${label}: LIVE — modules: ${Object.keys(mods).slice(0,8).join(', ')}`);
  } catch(e:any){ console.log(`✗ ${label}: ${String(e.message||e).slice(0,45)}`); }
}

// Definitive: search testnet for ANY recent haSUI/Haedal staking activity.
// Try common Haedal function names across a broad query isn't possible without a pkg;
// so we check if the mainnet haSUI coin type has any testnet supply/objects.
console.log('\n(If both absent on testnet, Haedal is mainnet-only like the others.)');
