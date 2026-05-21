import 'dotenv/config';
import { makeSuiClient } from './lib/sui.js';

const suiClient = await makeSuiClient();
const pkg = process.env.PREDICT_PACKAGE_ID!;

// List every function in predict_manager so we see deposit/withdraw shape
const mod = await suiClient.getNormalizedMoveModule({
  package: pkg,
  module: 'predict_manager',
});

console.log('=== predict_manager exposed functions ===\n');
for (const [name, fn] of Object.entries(mod.exposedFunctions)) {
  const vis = fn.visibility;
  const params = fn.parameters.length;
  console.log(`${vis.padEnd(10)} ${name}  (${params} params, ${fn.typeParameters.length} type params)`);
}

// Detail the ones that matter for PLP custody
console.log('\n=== detail: deposit / withdraw ===');
for (const fn of ['deposit', 'withdraw'] as const) {
  const f = mod.exposedFunctions[fn];
  if (!f) { console.log(`\n${fn}: NOT FOUND`); continue; }
  console.log(`\n${fn}<${f.typeParameters.length} type param(s)>:`);
  f.parameters.forEach((p, i) => console.log(`  [${i}] ${JSON.stringify(p)}`));
  console.log(`  returns: ${JSON.stringify(f.return)}`);
}