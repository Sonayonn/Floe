# Floe Verifiable Valuation

**A reusable Sui attestation primitive: attest any value inside a hardware-attested
enclave, verify the signature on-chain before acting on it.**

Floe is the first consumer of this primitive — it proves its vault NAV. But nothing
here is vault-specific. Any protocol with a hard-to-value number (a vault's NAV, a
volatility index, a lending market's illiquid collateral) can register an enclave and
attest its value through the same path.

---

## The problem it solves

Most DeFi valuations are *asserted*, not *proven*. A vault reports its NAV; a lending
market reports collateral value; you trust the operator. The 2025 oracle/NAV
manipulation losses (and the structured-product collapses behind them) are all the same
root cause: a number nobody could independently verify.

This primitive inverts that. The value is computed inside a Nautilus enclave — code
running on AWS Nitro hardware whose measurements (PCRs) are reproducible and registered
on-chain — and signed. A Move contract verifies that signature against the registered
enclave *before* acting. The number isn't trusted; it's proven.

This is only possible on Sui: Nautilus verifies a TEE attestation natively in Move.
No other L1 can check hardware-attestation on-chain.

---

## How it works

1. **Register an enclave once.** Build the signer reproducibly (StageX → identical EIF →
   PCRs), run it on AWS Nitro, and register the attested `Enclave` object on-chain. Its
   PCR measurements are now the on-chain anchor of trust.
2. **Attest a typed value.** The enclave signs a BCS payload `(intent ‖ timestamp ‖ id ‖
   value… )` with a per-value-type **intent byte**.
3. **Verify on-chain.** A `verify_*` function reconstructs the payload and calls
   `enclave::verify_signature`. If the signature isn't from the registered enclave, it
   aborts. Distinct intent bytes mean a signature for one value type can **never** be
   replayed as another.

Every payload is the same stable 57-byte shape (`intent 1 + timestamp 8 + id 32 +
u64 8 + u64 8`), unit-tested in both Move and the Rust signer so serialization can't drift.

---

## Three reference consumers

| Consumer | Intent | Payload | Used by |
|----------|--------|---------|---------|
| **NAV** | 1 | `{ vault_id, nav, plp_price }` | Floe's flagship vault (verifiable NAV) |
| **Vol index** | 2 | `{ oracle_id, vol_bps, spot }` | Floe's on-chain implied-vol index |
| **Collateral** | 3 | `{ asset_id, value, ltv_bps }` | *example*: a lending market valuing illiquid collateral |

The collateral consumer isn't a Floe feature — it's a worked example showing a *different*
protocol could use the same primitive. That's the point: this is infrastructure.

---

## API

```move
// verify an enclave-signed value; aborts if the signature isn't from the registered enclave
public fun verify_nav<T>(enclave: &Enclave<T>, nav: u64, plp_price: u64,
    vault_id: address, timestamp_ms: u64, signature: vector<u8>): (u64, u64);

public fun verify_vol_attested<T>(enclave: &Enclave<T>, vol_bps: u64, spot: u64,
    oracle_id: address, timestamp_ms: u64, signature: vector<u8>): (u64, u64);

public fun verify_collateral_attested<T>(enclave: &Enclave<T>, value: u64, ltv_bps: u64,
    asset_id: address, timestamp_ms: u64, signature: vector<u8>): (u64, u64);
```

## Add your own value type

1. Define a payload struct: `public struct MyPayload has copy, drop { id: address, a: u64, b: u64 }`
2. Pick a fresh intent byte (4, 5, …) — never reuse one (intent separation prevents replay).
3. Add `verify_my_value<T>(...)` mirroring the pattern; have your enclave signer produce the
   matching BCS payload (keep the 57-byte shape, or extend consistently on both sides).
4. Unit-test the serde in Move and Rust so the byte layouts match field-for-field.

---

## Why this is a primitive, not a feature

Walrus is verifiable *data*. Nautilus is verifiable *compute*. This is verifiable
*valuation* — the layer that lets any Sui protocol prove a number instead of asserting it.
Floe happens to be its first and most demanding consumer (a structured-product vault on
DeepBook Predict), but the primitive stands on its own.

*Part of [Floe](../../README.md). Built on [Mysten Nautilus](https://docs.sui.io/concepts/cryptography/nautilus).*
