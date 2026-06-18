/**
 * Seed the Floe registry with 4 production-shaped vaults (Phase 1, vault creation).
 *
 *   MAIN DEPLOYER (0x9a24…, CLI active address):
 *     1. Floe Multi-Venue [flMV]  — multivenue   — PLP|RANGE|HEDGE — 2%/20%
 *     2. Floe Reserve     [flRSV] — reserve       — PLP            — 1%/10%
 *   FRESH DEPLOYER (generated here, funded 1.5 SUI from main):
 *     3. Range Ladder     [flRNG] — range-ladder  — PLP|RANGE      — 2%/20%
 *     4. Delta-Hedged     [flHDG] — delta-hedged  — PLP|RANGE|HEDGE— 2%/20%
 *
 * publishShareModule shells out to `sui client publish` (CLI active address owns
 * the TreasuryCap), so the CLI active address MUST equal the deploy() signer.
 * We therefore import + switch the CLI active address to the fresh key for 3/4,
 * and always switch back to main in a finally block.
 *
 * Run from packages/sdk with SUI_PRIVATE_KEY + PREDICT_PACKAGE_ID in env:
 *   set -a; . ../../scripts/.env; set +a; node scripts/seed-vaults.ts
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { FloeClient, FloeVault, Policy, type DeployedVault } from '../src/index.ts';

const DUSDC = '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC';
const ORACLE = '0xb79524498a9947307e192d8045772150dc47aade4f9e09bd4b6fe3236b9e3125';
const PREDICT_PKG = process.env.PREDICT_PACKAGE_ID;
if (!process.env.SUI_PRIVATE_KEY) throw new Error('SUI_PRIVATE_KEY missing');
if (!PREDICT_PKG) throw new Error('PREDICT_PACKAGE_ID missing');

const { Stratum } = Policy;
const sui = (args: string[]) => execFileSync('sui', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

/** Shared policy template; varies only by enabled strata + PLP floor. */
function policy(strata: number, plpFloorBps: number) {
  return {
    allowedOracles: [ORACLE],
    maxPositionSize: 1_000_000_000n,
    maxTotalExposure: 10_000_000_000n,
    maxLeverageBps: 30_000,
    enabledStrata: strata,
    plpFloorBps,
  };
}

type Spec = {
  name: string; symbol: string; strategyKind: string;
  strata: number; plpFloorBps: number; managementBps: number; performanceBps: number;
};

async function deploy(floe: FloeClient, s: Spec): Promise<DeployedVault & { label: string; curator: string }> {
  console.log(`\n▶ deploying "${s.name}" [${s.symbol}] (${s.strategyKind}) as ${floe.address!.slice(0, 10)}…`);
  const v = await FloeVault.deploy(floe, {
    asset: DUSDC, name: s.name, symbol: s.symbol, strategyKind: s.strategyKind,
    policy: policy(s.strata, s.plpFloorBps),
    fees: { managementBps: s.managementBps, performanceBps: s.performanceBps },
    predictPackageId: PREDICT_PKG!,
  });
  console.log(`  ✓ vault ${v.vaultId}`);
  return { label: s.name, curator: floe.address!, ...v };
}

const main = Ed25519Keypair.fromSecretKey(decodeSuiPrivateKey(process.env.SUI_PRIVATE_KEY!).secretKey);
const floeMain = new FloeClient({ network: 'testnet', signer: main });
const mainAddr = main.toSuiAddress();

const cliActive = sui(['client', 'active-address']).trim();
if (cliActive !== mainAddr) throw new Error(`CLI active ${cliActive} != main signer ${mainAddr}; aborting`);

const results: Array<{ label: string; curator: string; vaultId: string } & Partial<DeployedVault>> = [];

// ── Vault 1 (Floe Multi-Venue) already deployed in the prior run — recorded for the artifact. ──
results.push({ label: 'Floe Multi-Venue (pre-deployed)', curator: mainAddr, vaultId: '0x1ea69d68c9230470f107361c56763e3eed429f4b44de57ae73731c1f4bd6aabc' });

// ── Vault 2: main deployer ──
results.push(await deploy(floeMain, { name: 'Floe Reserve', symbol: 'flRSV', strategyKind: 'reserve', strata: Stratum.PLP, plpFloorBps: 8_000, managementBps: 100, performanceBps: 1_000 }));

// ── Fresh deployer for vaults 3 + 4 ──
const fresh = new Ed25519Keypair();
const freshAddr = fresh.toSuiAddress();
const freshSk = fresh.getSecretKey();
console.log('\n════════ FRESH DEPLOYER (SAVE THIS KEY) ════════');
console.log('  address:    ', freshAddr);
console.log('  secret key: ', freshSk);
console.log('════════════════════════════════════════════════');

console.log('\n▶ importing fresh key into CLI keystore…');
sui(['keytool', 'import', freshSk, 'ed25519', '--json']);

console.log('▶ funding fresh deployer with 1.5 SUI from main…');
const fundTx = new Transaction();
const [coin] = fundTx.splitCoins(fundTx.gas, [fundTx.pure.u64(1_500_000_000n)]);
fundTx.transferObjects([coin], fundTx.pure.address(freshAddr));
const fundRes = await floeMain.sui.signAndExecuteTransaction({ signer: main, transaction: fundTx, options: { showEffects: true } });
if (fundRes.effects?.status?.status !== 'success') throw new Error(`funding failed: ${JSON.stringify(fundRes.effects?.status)}`);
await floeMain.sui.waitForTransaction({ digest: fundRes.digest });
console.log(`  ✓ funded (digest ${fundRes.digest})`);

const floeFresh = new FloeClient({ network: 'testnet', signer: fresh });
try {
  console.log('▶ switching CLI active address to fresh deployer…');
  sui(['client', 'switch', '--address', freshAddr]);
  results.push(await deploy(floeFresh, { name: 'Range Ladder', symbol: 'flRNG', strategyKind: 'range-ladder', strata: Stratum.PLP | Stratum.RANGE, plpFloorBps: 5_000, managementBps: 200, performanceBps: 2_000 }));
  results.push(await deploy(floeFresh, { name: 'Delta-Hedged', symbol: 'flHDG', strategyKind: 'delta-hedged', strata: Stratum.PLP | Stratum.RANGE | Stratum.HEDGE, plpFloorBps: 4_000, managementBps: 200, performanceBps: 2_000 }));
} finally {
  console.log('\n▶ restoring CLI active address to main deployer…');
  sui(['client', 'switch', '--address', mainAddr]);
  console.log(`  ✓ active address back to ${sui(['client', 'active-address']).trim()}`);
}

const artifact = {
  deployedAt: new Date().toISOString(),
  network: 'testnet',
  mainDeployer: mainAddr,
  freshDeployer: freshAddr,
  vaults: results,
};
writeFileSync(new URL('./seed-vaults-result.json', import.meta.url), JSON.stringify(artifact, null, 2));

console.log('\n══════════════ SUMMARY ══════════════');
for (const v of results) console.log(`  ${v.label.padEnd(18)} ${v.vaultId}  (curator ${v.curator.slice(0, 10)}…)`);
console.log('\nArtifact: packages/sdk/scripts/seed-vaults-result.json');
console.log('⚠  Save the fresh deployer secret key above — it is not written to the artifact.');
