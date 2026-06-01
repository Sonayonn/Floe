import { FloeClient, FloeVault, Registry, Treasury } from '../src/index.ts';

const floe = new FloeClient({ network: 'testnet' });
const VAULT = '0xea33fe41c7512a1a36be417b0ce400ada0db0d9fe54f2ade75662aaef987de2e';

console.log('=== Floe SDK — live read (v3.2 reference vault) ===\n');

const s = await FloeVault.getVaultState(floe, VAULT);
console.log(`Vault:          ${s.vaultId.slice(0, 12)}…  (v${s.version})`);
console.log(`NAV:            $${Number(s.nav) / 1e6}`);
console.log(`Share price:    $${Number(s.sharePrice) / 1e6}`);
console.log(`Share supply:   ${Number(s.shareSupply) / 1e6}`);
console.log(`  idle $${Number(s.idle)/1e6} | PLP ${Number(s.plpHeld)/1e6} @ ${Number(s.plpPrice)/1e9} | marks $${Number(s.positionsMarkTotal)/1e6} (${s.positionCount} pos)`);
console.log(`Fees:           ${Number(s.managementFeeBps)/100}% mgmt / ${Number(s.performanceFeeBps)/100}% perf`);
console.log(`Protocol fee:   ${Number(s.protocolFeeBps)/100}% of curator fees  | attested: ${s.attested}`);
console.log(`Capacity:       ${s.maxCapacity === 0n ? 'uncapped' : '$' + Number(s.maxCapacity)/1e6} | deposits frozen: ${s.depositsFrozen}`);

console.log('\n=== Earn directory (Registry.listVaults) ===');
const vaults = await Registry.listVaults(floe);
for (const v of vaults) console.log(`  • ${v.name || '(unnamed)'} [${v.strategyKind}] — ${v.vaultId.slice(0,12)}… curator ${v.curator.slice(0,8)}…`);

console.log('\n=== Protocol revenue (Treasury.getProtocolRevenue) ===');
const rev = await Treasury.getProtocolRevenue(floe);
if (rev.holdings.length === 0) console.log('  (no protocol fees accrued yet)');
for (const h of rev.holdings) console.log(`  ${Number(h.balance)/1e6} shares of ${h.coinType.split('::').pop()}`);
