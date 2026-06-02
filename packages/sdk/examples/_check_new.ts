import { FloeClient, FloeVault } from '../src/index.ts';
const floe = new FloeClient({ network: 'testnet' });
const s = await FloeVault.getVaultState(floe, '0x2e5b19ac7e7773a274474b91776fa7cea1de10ffc84d087b7e79a061b2a85655');
console.log('New SDK-deployed vault:');
console.log(`  NAV $${Number(s.nav)/1e6} | share $${Number(s.sharePrice)/1e6} | supply ${Number(s.shareSupply)/1e6}`);
console.log(`  fees ${Number(s.managementFeeBps)/100}% mgmt / ${Number(s.performanceFeeBps)/100}% perf | protocol ${Number(s.protocolFeeBps)/100}% | attested ${s.attested}`);
console.log(`  curator ${s.curator.slice(0,10)}… | version ${s.version}`);
