import { publishShareModule } from '../src/share/publish.ts';

console.log('Publishing a fresh per-vault share module via @floe/sdk (coin_registry)...\n');
const result = publishShareModule({
  symbol: 'flTest',
  name: 'Floe Test Share',
  description: 'SDK-published test share',
});
console.log('Published share module:');
console.log('  package:      ', result.sharePackageId);
console.log('  share type:   ', result.shareType);
console.log('  TreasuryCap:  ', result.treasuryCapId);
console.log('  MetadataCap:  ', result.metadataCapId ?? '(none)');
console.log('  digest:       ', result.digest);
console.log('\nThis TreasuryCap is what FloeVault.deploy passes into deploy_vault as the vault share S.');
