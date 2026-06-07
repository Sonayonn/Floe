import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { fromHex } from '@mysten/sui/utils';
import { readFileSync } from 'fs';

const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const kp = Ed25519Keypair.fromSecretKey(process.env.SUI_PRIVATE_KEY!);

const NAV_PKG = '0x07677cefab304e5d27d8e2dc4aed20a6ef0f9b8bbadf25de67f61a574a658d7a'; // floe_nav V4
const VOL_PKG = '0xb94fb487c4e3068869c0f1d2b7df013aba7d15fcbabbe0834d966bc546ae2c10'; // floe_vol
const VOL_INDEX = '0x114b2934a04bb9e063bc368ffd6cba06fd821dd54edadd48e5e118e7b57f119a';
const ENCLAVE = '0x0f6def7875e18c18611de571b262df95d2d9a5d85b35ab56f93e4f2d2a31aa2d'; // NEW enclave obj
const OTW = `${'0xc9bae1737b1744108491f6c4d7c87128520d6b61151d9e3bc23c262cbc0026e0'}::floe_nav::FLOE_NAV`;
const CLOCK = '0x6';

const arrToHex = (a: number[]) => '0x' + a.map(x => x.toString(16).padStart(2,'0')).join('');

async function run(label: string, build: (tx: Transaction) => void, expectOk: boolean) {
  const tx = new Transaction();
  build(tx);
  try {
    const r = await sui.signAndExecuteTransaction({ signer: kp, transaction: tx, options: { showEffects: true } });
    const ok = r.effects?.status?.status === 'success';
    const verdict = ok === expectOk ? '✓ PASS' : '✗ FAIL';
    console.log(`${verdict}  ${label}: ${r.effects?.status?.status}`, ok ? r.digest : (r.effects?.status?.error ?? ''));
  } catch (e: any) {
    const ok = false;
    const verdict = ok === expectOk ? '✓ PASS (rejected as expected)' : '✗ FAIL';
    console.log(`${verdict}  ${label}: aborted`, String(e.message ?? e).slice(0, 80));
  }
}

// ── P2: VOL (intent 2) ──
const vol = JSON.parse(readFileSync('../enclave/vol_signed.json', 'utf8')).response;
const volSig = JSON.parse(readFileSync('../enclave/vol_signed.json', 'utf8')).signature;
await run('[P2 VALID] enclave-signed vol -> update_vol_attested', (tx) => {
  tx.moveCall({
    target: `${VOL_PKG}::floe_vol_index::update_vol_attested`,
    arguments: [
      tx.object(VOL_INDEX),
      tx.pure.id(arrToHex(vol.data.oracle_id)),
      tx.pure.u64(vol.data.vol_bps),
      tx.pure.u64(vol.data.spot),
      tx.pure.u64(vol.timestamp_ms),
      tx.pure.vector('u8', Array.from(fromHex(volSig))),
      tx.object(CLOCK),
    ],
  });
}, true);

// ── P2: tampered vol (flip vol_bps) -> must reject ──
await run('[P2 TAMPER] wrong vol_bps, same sig -> must reject', (tx) => {
  tx.moveCall({
    target: `${VOL_PKG}::floe_vol_index::update_vol_attested`,
    arguments: [
      tx.object(VOL_INDEX),
      tx.pure.id(arrToHex(vol.data.oracle_id)),
      tx.pure.u64(vol.data.vol_bps + 100),  // tampered
      tx.pure.u64(vol.data.spot),
      tx.pure.u64(vol.timestamp_ms),
      tx.pure.vector('u8', Array.from(fromHex(volSig))),
      tx.object(CLOCK),
    ],
  });
}, false);

// ── P1: RISK (intent 4) ──
const risk = JSON.parse(readFileSync('../enclave/risk_signed.json', 'utf8')).response;
const riskSig = JSON.parse(readFileSync('../enclave/risk_signed.json', 'utf8')).signature;
await run('[P1 VALID] enclave-signed risk -> verify_risk_attested', (tx) => {
  tx.moveCall({
    target: `${NAV_PKG}::floe_nav::verify_risk_attested`,
    typeArguments: [OTW],
    arguments: [
      tx.object(ENCLAVE),
      tx.pure.u64(risk.data.utilization_bps),
      tx.pure.u64(risk.data.max_exposure_bps),
      tx.pure.u64(risk.data.worst_case_drawdown_bps),
      tx.pure.address(arrToHex(risk.data.subject_id)),
      tx.pure.u64(risk.timestamp_ms),
      tx.pure.vector('u8', Array.from(fromHex(riskSig))),
    ],
  });
}, true);

// ── P1: tampered risk (flip utilization) -> must reject ──
await run('[P1 TAMPER] wrong utilization, same sig -> must reject', (tx) => {
  tx.moveCall({
    target: `${NAV_PKG}::floe_nav::verify_risk_attested`,
    typeArguments: [OTW],
    arguments: [
      tx.object(ENCLAVE),
      tx.pure.u64(risk.data.utilization_bps + 500),  // tampered
      tx.pure.u64(risk.data.max_exposure_bps),
      tx.pure.u64(risk.data.worst_case_drawdown_bps),
      tx.pure.address(arrToHex(risk.data.subject_id)),
      tx.pure.u64(risk.timestamp_ms),
      tx.pure.vector('u8', Array.from(fromHex(riskSig))),
    ],
  });
}, false);

console.log('\nSession verification complete.');
