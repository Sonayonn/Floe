import 'dotenv/config';
import { makeSuiClient } from './lib/sui.js';

const suiClient = await makeSuiClient();
const pkg = process.env.PREDICT_PACKAGE_ID!;

// Candidate modules to introspect. We try each and report what's there.
const candidates: Array<[string, string]> = [
  ['range_key', 'new'],
  ['range_key', 'create'],
  ['market_key', 'new_range'],
  ['predict', 'mint_range'],
  ['predict', 'mint_vertical_range'],
];

// First: list ALL modules in the predict package so we know what exists
console.log('=== Modules in predict package ===');
try {
  const pkgInfo = await suiClient.getNormalizedMoveModulesByPackage({ package: pkg });
  const modules = Object.keys(pkgInfo);
  console.log(modules.sort().join('\n'));
} catch (e) {
  console.log(`Failed: ${(e as Error).message}`);
}

// Then probe each candidate
for (const [mod, fn] of candidates) {
  console.log(`\n=== ${mod}::${fn} ===`);
  try {
    const f = await suiClient.getNormalizedMoveFunction({
      package: pkg,
      module: mod,
      function: fn,
    });
    console.log(`Type params: ${JSON.stringify(f.typeParameters)}`);
    console.log(`Params (${f.parameters.length}):`);
    f.parameters.forEach((p, i) =>
      console.log(`  [${i}] ${JSON.stringify(p)}`),
    );
    console.log(`Returns: ${JSON.stringify(f.return)}`);
  } catch (e) {
    console.log(`NOT FOUND: ${(e as Error).message}`);
  }
}