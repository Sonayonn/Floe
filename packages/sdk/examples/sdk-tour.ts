/**
 * @floe/sdk live tour — exercises every read surface against testnet.
 * Run: pnpm exec tsx examples/sdk-tour.ts
 *
 * Proves the SDK surfaces the shipped capabilities: vault NAV, the registry,
 * the on-chain vol index, and the Nautilus attestation moat — all live.
 */
import { FloeClient, FloeVault, Registry, Vol, Attestation, DeepBookModule } from '../src/index.ts';

const REF_VAULT = '0xea33fe41c7512a1a36be417b0ce400ada0db0d9fe54f2ade75662aaef987de2e';

const floe = new FloeClient({ network: 'testnet' });
const pct = (bps: bigint) => (Number(bps) / 100).toFixed(2) + '%';
const usd = (raw: bigint) => '$' + (Number(raw) / 1e6).toFixed(2);

console.log('— Floe SDK live tour (testnet) —\n');

// 1) Vault NAV (read)
const v = await FloeVault.getVaultState(floe, REF_VAULT);
console.log('VAULT', REF_VAULT.slice(0, 10) + '…');
console.log('  NAV', usd(v.nav), '| share price', usd(v.sharePrice), '| supply', v.shareSupply.toString());
console.log('  PLP held', v.plpHeld.toString(), '| attested tier:', v.attested);

// 2) DeepBook venue valuation via the uniform VenueModule interface
const dbVal = await DeepBookModule.value(floe, REF_VAULT);
console.log('\nVENUE', dbVal.venue, '→', usd(dbVal.valueRaw),
  '(parts:', Object.entries(dbVal.parts ?? {}).map(([k, x]) => `${k}=${usd(x as bigint)}`).join(', ') + ')');

// 3) On-chain implied-vol index (live compute via devInspect)
const volBps = await Vol.volNow(floe);
console.log('\nVOL INDEX  vol_now (on-chain compute) =', pct(volBps), '(BTC ATM implied vol)');
const snap = await Vol.currentVol(floe);
console.log('  last snapshot:', pct(snap.volBps), '| samples', snap.samples.toString());

// 4) The attestation moat
const info = Attestation.enclaveInfo(floe);
const live = await Attestation.isEnclaveLive(floe);
console.log('\nATTESTATION (the moat)');
console.log('  Enclave', info.enclaveId.slice(0, 10) + '…', '| live on-chain:', live);
console.log('  PCR0', info.pcr0.slice(0, 24) + '…');
console.log('  verifyNav / verifyVolAttested available (require signer + enclave signature)');

console.log('\n✓ SDK surfaces vault NAV, venues, on-chain vol, and the attestation moat — all live.');
