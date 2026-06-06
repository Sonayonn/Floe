/// Floe Implied Volatility Index — the Sui vol benchmark.
///
/// Computes at-the-money implied volatility ENTIRELY ON-CHAIN from DeepBook
/// Predict's Block Scholes SVI oracle. Any protocol can call `vol_now(oracle, clock)`
/// synchronously in its own transaction — a composable volatility primitive.
///
/// SVI total variance at log-moneyness k:
///   w(k) = a + b*( rho*(k-m) + sqrt((k-m)^2 + sigma^2) )
/// ATM (k=0):  w0 = a + b*( rho*(-m) + sqrt(m^2 + sigma^2) )
/// iv = sqrt(w0 / T),  returned in basis points (7090 = 70.90%).
/// Fixed-point scale 1e9 (matches SVIParams + i64 float_scaling).
module floe_vol::floe_vol_index;

// Attested vol: the enclave signs a VolPayload (intent 2, same shape as floe_nav) so any
// consumer gets a VERIFIABLE vol reading with a freshness proof — no stale-feed / feeder-lag
// risk. floe_vol self-verifies (imports ed25519) so 'Floe Index' is a standalone primitive.

use sui::clock::Clock;
use sui::event;
use sui::ed25519;
use sui::dynamic_field as df;
use std::bcs;
use deepbook_predict::oracle::{Self, OracleSVI};

const SCALE: u128 = 1_000_000_000;
const MS_PER_YEAR: u128 = 31_557_600_000;
const BPS: u128 = 10_000;

const EExpired: u64 = 0;
const EZeroVol: u64 = 1;

public struct VolIndex has key {
    id: UID,
    vol_bps: u64,
    spot: u64,
    expiry_ms: u64,
    updated_ms: u64,
    samples: u64,
}

public struct VolUpdated has copy, drop { vol_bps: u64, spot: u64, updated_ms: u64 }

fun init(ctx: &mut TxContext) {
    transfer::share_object(VolIndex {
        id: object::new(ctx), vol_bps: 0, spot: 0, expiry_ms: 0, updated_ms: 0, samples: 0,
    });
}

/// Integer sqrt (Newton) on u128.
fun sqrt_u128(x: u128): u128 {
    if (x == 0) return 0;
    let mut z = (x + 1) / 2;
    let mut y = x;
    while (z < y) { y = z; z = (x / z + z) / 2; };
    y
}
/// sqrt of a scale-1e9 fixed-point value, returning scale-1e9.
fun sqrt_scaled(x_scaled: u128): u128 { sqrt_u128(x_scaled * SCALE) }

/// Compute ATM implied vol (bps) from the live SVI oracle. Pure, on-chain, composable.
public fun vol_now(o: &OracleSVI, clock: &Clock): u64 {
    let svi = oracle::svi(o);
    let a = (oracle::svi_a(&svi) as u128);       // u64, scale 1e9
    let b = (oracle::svi_b(&svi) as u128);       // u64
    let sigma = (oracle::svi_sigma(&svi) as u128); // u64 (unsigned!)
    let m_i = oracle::svi_m(&svi);               // i64
    let rho_i = oracle::svi_rho(&svi);           // i64
    let m = (m_i.magnitude() as u128);
    let m_neg = m_i.is_negative();
    let rho = (rho_i.magnitude() as u128);
    let rho_neg = rho_i.is_negative();

    let now = (clock.timestamp_ms() as u128);
    let expiry = (oracle::expiry(o) as u128);
    assert!(expiry > now, EExpired);
    compute_iv_bps(a, b, m, m_neg, rho, rho_neg, sigma, expiry - now)
}

/// Pure ATM-implied-vol math (scale 1e9 in, bps out). Testable in isolation.
public fun compute_iv_bps(
    a: u128, b: u128, m: u128, m_neg: bool, rho: u128, rho_neg: bool,
    sigma: u128, tte_ms: u128,
): u64 {
    let m2 = (m * m) / SCALE;
    let s2 = (sigma * sigma) / SCALE;
    let root = sqrt_scaled(m2 + s2);
    let rho_m = (rho * m) / SCALE;
    let rho_negm_pos = (rho_neg != m_neg);
    let inner = if (rho_negm_pos) { root + rho_m }
                else { if (root >= rho_m) { root - rho_m } else { 0 } };
    let w0 = a + (b * inner) / SCALE;
    assert!(w0 > 0, EZeroVol);
    let t_scaled = (tte_ms * SCALE) / MS_PER_YEAR;
    assert!(t_scaled > 0, EExpired);
    let var_over_t = (w0 * SCALE) / t_scaled;
    let iv = sqrt_scaled(var_over_t);
    let iv_bps = (iv * BPS) / SCALE;
    (iv_bps as u64)
}

#[test]
fun test_iv_matches_reference() {
    // live params we validated off-chain -> 70.9% (7090 bps). m,rho both positive here.
    let bps = compute_iv_bps(
        839329, 18313192, 41245144, false, 166977, false, 31264120, 112087536,
    );
    // allow small integer-sqrt rounding tolerance around 7090
    assert!(bps >= 6900 && bps <= 7300, bps);
}

public fun update_vol_index(index: &mut VolIndex, o: &OracleSVI, clock: &Clock) {
    let vol_bps = vol_now(o, clock);
    let spot = oracle::spot_price(o);
    index.vol_bps = vol_bps;
    index.spot = spot;
    index.expiry_ms = oracle::expiry(o);
    index.updated_ms = clock.timestamp_ms();
    index.samples = index.samples + 1;
    event::emit(VolUpdated { vol_bps, spot, updated_ms: index.updated_ms });
}

public fun current_vol_bps(index: &VolIndex): u64 { index.vol_bps }
public fun current_spot(index: &VolIndex): u64 { index.spot }
public fun last_updated_ms(index: &VolIndex): u64 { index.updated_ms }
public fun sample_count(index: &VolIndex): u64 { index.samples }


// ─── Attested vol (Floe Index) ───────────────────────────────────────────────
const EBadVolAttester: u64 = 100;
const ENoVolAttester: u64 = 101;
const EBadVolAttestation: u64 = 102;
const EStaleVolAttestation: u64 = 103;
const VOL_INTENT: u8 = 2;                 // matches floe_nav VolPayload intent
const VOL_FRESH_WINDOW_MS: u64 = 600_000; // 10 min

public struct VolAttesterKey has copy, drop, store {}
public struct AttestedVol has copy, drop, store { vol_bps: u64, spot: u64, oracle_id: ID, timestamp_ms: u64 }
public struct AttestedVolKey has copy, drop, store {}
public struct VolAttested has copy, drop { vol_bps: u64, spot: u64, oracle_id: ID, timestamp_ms: u64 }

/// Register the enclave attester pubkey (settable once; the index is a singleton public good).
public fun register_vol_attester(index: &mut VolIndex, pubkey: vector<u8>) {
    assert!(pubkey.length() == 32, EBadVolAttester);
    assert!(!df::exists_(&index.id, VolAttesterKey {}), EBadVolAttester); // once only
    df::add(&mut index.id, VolAttesterKey {}, pubkey);
}

public fun vol_attester(index: &VolIndex): vector<u8> {
    if (df::exists_(&index.id, VolAttesterKey {})) { *df::borrow<VolAttesterKey, vector<u8>>(&index.id, VolAttesterKey {}) } else { vector[] }
}

/// Attested vol update: the enclave signs BCS(intent=2 || oracle_id || vol_bps || spot || timestamp_ms).
/// Anyone can submit a signed reading; the contract verifies it against the registered key, binding
/// the vol to the on-chain oracle identity + a freshness window. Tamper any field -> sig fails -> abort.
public fun update_vol_attested(
    index: &mut VolIndex, oracle_id: ID, vol_bps: u64, spot: u64, timestamp_ms: u64,
    signature: vector<u8>, clock: &Clock,
) {
    assert!(df::exists_(&index.id, VolAttesterKey {}), ENoVolAttester);
    let now = clock.timestamp_ms();
    assert!(timestamp_ms <= now && now - timestamp_ms <= VOL_FRESH_WINDOW_MS, EStaleVolAttestation);

    // reconstruct the signed message: intent || oracle_id || vol_bps || spot || timestamp_ms
    let mut msg = vector<u8>[VOL_INTENT];
    msg.append(bcs::to_bytes(&oracle_id));
    msg.append(bcs::to_bytes(&vol_bps));
    msg.append(bcs::to_bytes(&spot));
    msg.append(bcs::to_bytes(&timestamp_ms));

    let pubkey = df::borrow<VolAttesterKey, vector<u8>>(&index.id, VolAttesterKey {});
    assert!(ed25519::ed25519_verify(&signature, pubkey, &msg), EBadVolAttestation);

    let rec = AttestedVol { vol_bps, spot, oracle_id, timestamp_ms };
    if (df::exists_(&index.id, AttestedVolKey {})) {
        let _old: AttestedVol = df::remove(&mut index.id, AttestedVolKey {});
    };
    df::add(&mut index.id, AttestedVolKey {}, rec);
    event::emit(VolAttested { vol_bps, spot, oracle_id, timestamp_ms });
}

/// Read the attested vol record (vol_bps, spot, oracle_id, timestamp_ms, is_fresh).
public fun attested_vol(index: &VolIndex, clock: &Clock): (u64, u64, ID, u64, bool) {
    assert!(df::exists_(&index.id, AttestedVolKey {}), ENoVolAttester);
    let r = df::borrow<AttestedVolKey, AttestedVol>(&index.id, AttestedVolKey {});
    let fresh = clock.timestamp_ms() - r.timestamp_ms <= VOL_FRESH_WINDOW_MS;
    (r.vol_bps, r.spot, r.oracle_id, r.timestamp_ms, fresh)
}

public fun has_attested_vol(index: &VolIndex): bool { df::exists_(&index.id, AttestedVolKey {}) }
