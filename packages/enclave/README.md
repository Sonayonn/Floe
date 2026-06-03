# Floe NAV Enclave (Nautilus Stage B)

Rust enclave app that signs Floe NAV attestations. Built on Mysten's Nautilus
reproducible-build template (src/nautilus-server). This dir holds Floe's app module;
it is dropped into the template at `src/nautilus-server/src/apps/floe-nav/` and built
with `--features=floe-nav`.

## Verified
- `cargo test --features=floe-nav test_serde` PASSES: the signed IntentMessage BCS is
  exactly 57 bytes (intent 1 + timestamp 8 + vault_id 32 + nav 8 + plp_price 8),
  matching `floe_nav::floe_nav_tests::test_nav_payload_serde` in the Move package.
  This guarantees on-chain enclave::verify_signature will accept enclave-signed NAVs.

## On-chain targets (testnet)
- floe_nav package:  0xc9bae1737b1744108491f6c4d7c87128520d6b61151d9e3bc23c262cbc0026e0
- EnclaveConfig:     0x34e27a1bb7034cc6734c59b631e2362ef5515cd9d139871d8653c584825b7402
- Cap<FLOE_NAV>:     0xe84af0541528abaa11123a2b5a9c9cbee0c4ac18104c4ca3f1a6b3050cb72c9f

## Stage B remaining (AWS Nitro)
1. Build EIF: `make ENCLAVE_APP=floe-nav` -> PCR0/1/2
2. Launch EC2 Nitro instance, run enclave, expose port 3000
3. update_pcrs(EnclaveConfig, Cap, pcr0, pcr1, pcr2)
4. register_enclave(EnclaveConfig, attestation_doc) -> live Enclave object
5. Enclave signs a NAV -> floe_nav::verify_nav verifies on-chain. Full Tier 3.
