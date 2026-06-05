# Floe NAV Enclave — Reproducible Build

The EIF must reproduce the PCRs registered on-chain (EnclaveConfig 0x34e27a1b),
or enclave-signed NAVs will not verify. Registered measurements:

PCR0 = PCR1 = dfe6ad9df7ff5f5646ac5c3cf5da788b7b183e6ce607db41f280ec31d53626ac4bd2cf0d146d05cbee91b7ecc98d7a5b
PCR2 = 21b9efbc184807662e966d34f390821309eeac6802309798826296bf3e8bec7c10edb30948c90ba67310f7b964fc500a

## Build steps

1. Clone Mysten Nautilus template; drop floe-nav/ into src/nautilus-server/src/apps/floe-nav/
2. Wire feature: `floe-nav = []` in Cargo.toml; cfg module + re-export in lib.rs
3. REQUIRED main.rs patch (produces the dfe6ad9d PCR) — gate API_KEY out for floe-nav:
   - line ~20: #[cfg(not(feature = "seal-example"))]
     becomes:  #[cfg(not(any(feature = "seal-example", feature = "floe-nav")))]
   - line ~24: #[cfg(feature = "seal-example")]
     becomes:  #[cfg(any(feature = "seal-example", feature = "floe-nav"))]
     (both apply to `let api_key = ...`; without this the enclave panics on boot)
4. Build: DOCKER_BUILDKIT=1 make ENCLAVE_APP=floe-nav  (needs docker-buildx)
5. Verify PCR0 == dfe6ad9d before relying on it. Match => on-chain registration valid.

## Update — Tier-1 heartbeat endpoint (rebuild, PCR 489fdb1b)

Added /sign_heartbeat: signs BCS(vault_id)||BCS(plp_price)||BCS(timestamp_ms) — 48 bytes,
plain ed25519 — so core update_nav_attested (Tier-1) accepts an enclave-signed heartbeat.
Binary changed => PCR dfe6ad9d -> 489fdb1b, reproducible from committed mod.rs + main.rs patch.

Registered (EnclaveConfig 0x34e27a1b, re-registered):
PCR0=PCR1=489fdb1bc0d496fdf94ea06adb1f970a3a429cbcc31375d3af552b155bbcda81326833fec25a08ae058ce8e50caf5fa3
PCR2=21b9efbc184807662e966d34f390821309eeac6802309798826296bf3e8bec7c10edb30948c90ba67310f7b964fc500a
Live Enclave object: 0x3d2ba31849f5f2c916b812a987404554aa819e56e8da5939089327375d0cb496
Enclave attester pubkey: 69f23b336bf6fecc943491fda61f11d774d7b85d1ede25935ff8d73734abbac1
