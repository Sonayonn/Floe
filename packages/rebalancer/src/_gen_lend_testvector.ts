import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { bcs } from '@mysten/sui/bcs';

// deterministic test keypair (fixed seed for reproducible test vector)
const seed = new Uint8Array(32); seed.fill(7);
const kp = Ed25519Keypair.fromSecretKey(seed);
const pubkey = kp.getPublicKey().toRawBytes();

// our message layout: intent(1) || timestamp(8 LE) || vault_id(32) || nav_lower_bound(8 LE) || share_supply(8 LE)
const INTENT = 3;
const timestamp_ms = 1_700_000_000_000n;
const vault_id = new Uint8Array(32); vault_id.fill(0xAB);  // test vault address
const nav_lower_bound = 1_000_000_000n;   // 1000 USDC floor (6dp)
const share_supply = 1_000_000_000n;      // 1000 shares -> price = 1.0

const u64le = (v: bigint) => { const b = new Uint8Array(8); let x = v; for (let i=0;i<8;i++){b[i]=Number(x & 0xffn); x >>= 8n;} return b; };
const msg = new Uint8Array([INTENT, ...u64le(timestamp_ms), ...vault_id, ...u64le(nav_lower_bound), ...u64le(share_supply)]);

const sig = await kp.sign(msg);
const hex = (a: Uint8Array) => Array.from(a).map(x=>x.toString(16).padStart(2,'0')).join('');
console.log('// TEST VECTOR (deterministic seed=7x32)');
console.log('PUBKEY  =', hex(pubkey));
console.log('SIG     =', hex(sig));
console.log('MSG_LEN =', msg.length, '(expect 57: 1+8+32+8+8)');
console.log('VAULT   = 0x' + hex(vault_id));
console.log('TS      =', timestamp_ms.toString());
console.log('NAV     =', nav_lower_bound.toString());
console.log('SUPPLY  =', share_supply.toString());
// also a tampered sig (flip last byte) for the reject test
const bad = new Uint8Array(sig); bad[bad.length-1] ^= 0xff;
console.log('BAD_SIG =', hex(bad));
