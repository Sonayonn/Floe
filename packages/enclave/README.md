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

## Stage B progress (live on testnet)
- EIF built locally via StageX reproducible build (deterministic; anyone can rebuild + verify these PCRs):
  - PCR0/1: 6ee108f6896926ab3dc1ee0edd3c1fdec1a48e958cc4a168d3ef3fb75f5f80181eeb0ee8c96cd466644cd7a81155df8a
  - PCR2:   21b9efbc184807662e966d34f390821309eeac6802309798826296bf3e8bec7c10edb30948c90ba67310f7b964fc500a
- update_pcrs REGISTERED on-chain (tx 9UWJJT2nM1aoh7VEMFzed9KCdtExErrLGfkzfjiUfDRU): the EnclaveConfig
  now requires attestation docs matching these exact measurements.
- REMAINING: run the EIF on an EC2 Nitro instance -> get attestation document -> register_enclave -> live Enclave object -> verify_nav end-to-end.
