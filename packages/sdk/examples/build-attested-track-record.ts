import { FloeClient, Walrus, TrackRecord, Attestation } from '../src/index.ts';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { readFileSync } from 'fs';

const REF_VAULT = '0xea33fe41c7512a1a36be417b0ce400ada0db0d9fe54f2ade75662aaef987de2e';
const EXEC_CAP = '0x453356286d5240164af6fe5973adf9d46c18b9b8c4231ffc80e03dd9ea75c10e';
const types = ['0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC',
               '0x120c29a65c10ada7619429e46a608531cfcb4affe14439ca6838aaa77dfd029f::share::SHARE'] as [string,string];

const { secretKey } = decodeSuiPrivateKey(process.env.SUI_PRIVATE_KEY!);
const floe = new FloeClient({ network: 'testnet', signer: Ed25519Keypair.fromSecretKey(secretKey) });

// parse the 3 enclave-signed NAV responses
const lines = readFileSync('../enclave/track_sigs.txt', 'utf8').split('\n').map(l=>l.trim()).filter(Boolean);
const signed = lines.map(l => JSON.parse(l));
console.log(`parsed ${signed.length} enclave-signed snapshots\n`);

const SHARE_SUPPLY = 15_000_000n; // current supply; sharePrice = nav/supply * scale
for (const s of signed) {
  const nav = BigInt(s.response.data.nav);
  const plpPrice = s.response.data.plp_price.toString();
  const ts = s.response.timestamp_ms;
  const sharePrice = (nav * 1_000_000n) / SHARE_SUPPLY; // 6dp
  const snap = {
    vaultId: REF_VAULT,
    nav: nav.toString(),
    sharePrice: sharePrice.toString(),
    plpHeld: '4000000',
    plpPrice,
    positionsMarkTotal: '0',
    settledTotal: nav.toString(),  // post-settlement: all certain
    unsettledMarks: '0',
    pctCertain: 100,
    attested: true,
    navSignatureHex: s.signature,          // REAL enclave signature
    plpPriceAtSnapshot: plpPrice,
    timestampMs: ts,
  };
  const stored = await Walrus.storeSnapshot(snap);
  await Walrus.recordBlob(floe, { vaultId: REF_VAULT, execCap: EXEC_CAP, blobId: stored.blobId, types });
  console.log(`stored nav ${(Number(nav)/1e6).toFixed(2)} ts ${ts} blob ${stored.blobId.slice(0,12)}… (sig attached)`);
}

console.log('\n=== verifyTrackRecord (on-chain re-verification of each enclave sig) ===');
const points = await TrackRecord.verifyTrackRecord(floe, REF_VAULT, { verifyOnChain: true });
const tr = TrackRecord.computeTrackRecord(points);
console.log(`reconstructed ${points.length} points`);
console.log('per-point verified:', points.map(p => p.verified ? '✓' : '✗').join(' '));
if (tr) {
  console.log(`return ${(tr.totalReturnBps/100).toFixed(2)}% | APR ${(tr.aprBps/100).toFixed(1)}% | drawdown ${(tr.maxDrawdownBps/100).toFixed(2)}%`);
  console.log(`attested coverage: ${tr.pctAttested}% | avg pctCertain: ${tr.avgPctCertain}%`);
}
