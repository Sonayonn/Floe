import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
const sui = new SuiClient({ url: getFullnodeUrl('testnet') });

// Volo: the mainnet pkg is 0x549e8b69...; testnet is a DIFFERENT address.
// Probe the known mainnet pkg on testnet (likely absent), then we'll search.
const candidates: Record<string,string> = {
  'Volo (mainnet pkg, probing testnet)': '0x549e8b69270defbfafd4f94e17ec44cdbdd99820b33bda2278dea3b9a32d3f55',
};
for (const [label, pkg] of Object.entries(candidates)) {
  try {
    const mods = await sui.getNormalizedMoveModulesByPackage({ package: pkg });
    console.log(`✓ ${label}: FOUND on testnet — modules:`, Object.keys(mods).slice(0,10));
  } catch (e:any) {
    console.log(`✗ ${label}: not on testnet (${String(e.message||e).slice(0,60)})`);
  }
}
