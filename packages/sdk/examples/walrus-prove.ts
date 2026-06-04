/**
 * Live proof: write Floe NAV snapshots to Walrus, index them on-chain, reconstruct history.
 * Run: SUI_PRIVATE_KEY=... pnpm exec tsx examples/walrus-prove.ts
 */
import { FloeClient, FloeVault, Walrus, Agent } from '../src/index.ts';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

const REF_VAULT = '0xea33fe41c7512a1a36be417b0ce400ada0db0d9fe54f2ade75662aaef987de2e';
const EXEC_CAP = '0x453356286d5240164af6fe5973adf9d46c18b9b8c4231ffc80e03dd9ea75c10e';

const { secretKey } = decodeSuiPrivateKey(process.env.SUI_PRIVATE_KEY!);
const floe = new FloeClient({ network: 'testnet', signer: Ed25519Keypair.fromSecretKey(secretKey) });

console.log('— Floe × Walrus: tamper-evident audit trail —\n');

// resolve vault <Q,S> types for the on-chain record call
const types = await Agent.resolveVaultTypes(floe, REF_VAULT);

// take a live NAV snapshot from the vault
const v = await FloeVault.getVaultState(floe, REF_VAULT);
const snap = {
  vaultId: REF_VAULT,
  nav: v.nav.toString(),
  sharePrice: v.sharePrice.toString(),
  plpHeld: v.plpHeld.toString(),
  plpPrice: v.plpPrice.toString(),
  positionsMarkTotal: v.positionsMarkTotal.toString(),
  attested: v.attested,
  timestampMs: Date.now(),
};

// 1) store on Walrus
const stored = await Walrus.storeSnapshot(snap);
console.log('stored snapshot → blobId', stored.blobId, '(' + stored.size + ' bytes)');

// 2) index on-chain
const dig = await Walrus.recordBlob(floe, { vaultId: REF_VAULT, execCap: EXEC_CAP, blobId: stored.blobId, types });
console.log('indexed on-chain → tx', dig);

// 3) reconstruct the full history from chain + Walrus
const history = await Walrus.reconstructHistory(floe, REF_VAULT);
console.log('\nreconstructed history:', history.length, 'snapshot(s) on-chain');
history.slice(-3).forEach((h, i) => {
  console.log(`  [${i}] NAV ${(Number(h.nav)/1e6).toFixed(2)} | share ${(Number(h.sharePrice)/1e6).toFixed(2)} | ts ${new Date(h.timestampMs).toISOString()}`);
});
console.log('\n✓ NAV history is now tamper-evident: blob on Walrus, id anchored on-chain, fully reconstructable.');
