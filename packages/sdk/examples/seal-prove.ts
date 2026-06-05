/**
 * Live proof: encrypt a curator StrategyConfig with Seal, store on-chain, decrypt back.
 * Run: SUI_PRIVATE_KEY=... pnpm exec tsx examples/seal-prove.ts
 */
import { FloeClient, Seal, Agent } from '../src/index.ts';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

const REF_VAULT = '0xea33fe41c7512a1a36be417b0ce400ada0db0d9fe54f2ade75662aaef987de2e';
const CURATOR_CAP = '0xd2c21b75c54d17a3328bb30beb7a1c4728e829618843331611ee1daa0fe240b3';

const { secretKey } = decodeSuiPrivateKey(process.env.SUI_PRIVATE_KEY!);
const floe = new FloeClient({ network: 'testnet', signer: Ed25519Keypair.fromSecretKey(secretKey) });

console.log('— Floe × Seal: capability-gated strategy privacy —\n');

const types = await Agent.resolveVaultTypes(floe, REF_VAULT);

// the curator's proprietary strategy params (the "alpha")
const strategy = {
  sigmaWidth: 1.2,
  rebalanceThresholdPct: 50,
  hedgeBandDelta: 0.1,
  expiryCadenceDays: 7,
  note: 'proprietary — encrypted under CuratorCap',
};
console.log('plaintext strategy:', JSON.stringify(strategy));

// 1) encrypt
const ct = await Seal.encryptStrategy(floe, REF_VAULT, strategy);
console.log('\nencrypted →', ct.length, 'bytes ciphertext');

// 2) store on-chain
const dig = await Seal.setStrategyBlob(floe, { vaultId: REF_VAULT, curatorCap: CURATOR_CAP, ciphertext: ct, types });
console.log('stored on-chain → tx', dig);

// 3) read ciphertext back from chain
const stored = await Seal.getStrategyBlob(floe, REF_VAULT);
console.log('read back from vault →', stored.length, 'bytes');

// 4) decrypt as curator (SessionKey + seal_approve_curator policy)
const recovered = await Seal.decryptStrategyAsCurator(floe, { vaultId: REF_VAULT, curatorCap: CURATOR_CAP, ciphertext: stored, types });
console.log('\ndecrypted strategy:', JSON.stringify(recovered));

const ok = JSON.stringify(recovered) === JSON.stringify(strategy);
console.log(ok
  ? '\n✓ round-trip verified: encrypted under CuratorCap, stored on-chain, decrypted only by the cap holder.'
  : '\n✗ MISMATCH — recovered != original');
