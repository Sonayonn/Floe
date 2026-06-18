/**
 * Seed the 4 new vaults with a small starting dUSDC NAV (founder deposits).
 * Deposit is permissionless, so the founder seeds all four (incl. the two
 * fresh-deployer-curated vaults). One atomic PTB: merge the founder's dUSDC
 * coins, split varied amounts, deposit into each vault, return shares to founder.
 *
 *   set -a; . ../../scripts/.env; set +a; node scripts/seed-deposits.ts
 */
import { writeFileSync } from 'node:fs';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { FloeClient } from '../src/index.ts';

const DUSDC = '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC';
const CLOCK = '0x6';
if (!process.env.SUI_PRIVATE_KEY) throw new Error('SUI_PRIVATE_KEY missing');

const kp = Ed25519Keypair.fromSecretKey(decodeSuiPrivateKey(process.env.SUI_PRIVATE_KEY!).secretKey);
const floe = new FloeClient({ network: 'testnet', signer: kp });
const me = kp.toSuiAddress();
const PKG = floe.addresses.package;

// label, vaultId, shareType, amount (6dp dUSDC)
const SEEDS: Array<[string, string, string, bigint]> = [
  ['Floe Multi-Venue', '0x1ea69d68c9230470f107361c56763e3eed429f4b44de57ae73731c1f4bd6aabc', '0x6aa8862e649327ba2f4ec8622be8d4d602ed8fffbf0dd632afa4c08498613e10::share::SHARE', 3_500_000n],
  ['Floe Reserve',     '0xa9e3b73d72c739216b4e8481149a42a91c1efe4edda21b09cada8376c5c68ea1', '0x9e93a58367e189fcb3131bbde65d727f7ece940cfb805f4dbae2ffcebddcefe6::share::SHARE', 3_000_000n],
  ['Range Ladder',     '0x0edf9e5185eaa08d1602d61723b59d66431c0bf717c3ad257ada9fcbd4da005f', '0xea7f151c447875f5886bd3d0943b4021f1e85edf4e9bd2a8dceab9e7a16a4fba::share::SHARE', 2_000_000n],
  ['Delta-Hedged',     '0x44ac091ac377bb4fc97e721d6fd507c0e7ed5e293df1aeb9a4cea718fb893df0', '0x766e4ce2ef457e1475c602a5d893ccc7f577b1ed183fdfa971f3dfde83f65ca0::share::SHARE', 1_500_000n],
];

const coins = await floe.sui.getCoins({ owner: me, coinType: DUSDC });
if (coins.data.length === 0) throw new Error('no dUSDC coins');
const total = coins.data.reduce((s, c) => s + BigInt(c.balance), 0n);
const need = SEEDS.reduce((s, [, , , a]) => s + a, 0n);
if (total < need) throw new Error(`insufficient dUSDC: have ${total}, need ${need}`);

const tx = new Transaction();
// merge all dUSDC into the primary coin so a single object funds every split
const primary = tx.object(coins.data[0].coinObjectId);
if (coins.data.length > 1) tx.mergeCoins(primary, coins.data.slice(1).map((c) => tx.object(c.coinObjectId)));
const parts = tx.splitCoins(primary, SEEDS.map(([, , , a]) => tx.pure.u64(a)));
SEEDS.forEach(([, vaultId, sType], i) => {
  const shares = tx.moveCall({
    target: `${PKG}::floe::deposit`,
    typeArguments: [DUSDC, sType],
    arguments: [tx.object(vaultId), parts[i], tx.object(CLOCK)],
  });
  tx.transferObjects([shares], me);
});

console.log(`Seeding ${SEEDS.length} vaults with ${(Number(need) / 1e6).toFixed(2)} dUSDC total…`);
const res = await floe.sui.signAndExecuteTransaction({ signer: kp, transaction: tx, options: { showEffects: true } });
if (res.effects?.status?.status !== 'success') throw new Error(`seed deposits failed: ${JSON.stringify(res.effects?.status)}`);
await floe.sui.waitForTransaction({ digest: res.digest });
console.log(`✓ deposited (digest ${res.digest})`);

// confirm each vault NAV rose
console.log('\nVault NAVs after seeding:');
const navs: Record<string, string> = {};
for (const [label, vaultId] of SEEDS) {
  const o = await floe.sui.getObject({ id: vaultId, options: { showContent: true } });
  const f: any = (o.data?.content as any)?.fields ?? {};
  const idle = Number(f.idle ?? 0) / 1e6;
  const supply = Number(f.share_supply ?? 0) / 1e6;
  navs[label] = idle.toFixed(2);
  console.log(`  ${label.padEnd(18)} idle ${idle.toFixed(2)} dUSDC | shares ${supply.toFixed(2)}`);
}
writeFileSync(new URL('./seed-deposits-result.json', import.meta.url), JSON.stringify({ at: new Date().toISOString(), digest: res.digest, seeds: SEEDS.map(([l, v, , a]) => ({ label: l, vaultId: v, dusdc: Number(a) / 1e6 })), navs }, null, 2));
console.log('\nArtifact: packages/sdk/scripts/seed-deposits-result.json');
