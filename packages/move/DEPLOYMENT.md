# Floe Testnet Deployment

## v1 — CANONICAL (2026-05-22) — share token `floe::floe::FLOE`
- Package ID:   0x262094a517a978302db1c9462139717478021197c1038984035cd46d2ac0b188
- Publish tx:   GchaTRDCRz21kQWL5kKyc6kCbDx1mebF5MMVCCF7wWGU
- TreasuryCap:  0x576c8f7007c2560ae7cfad3133a8eed2534c02b819c08bd22efb5862975fa341
- CoinMetadata: 0xb5a9ef80661af0595eb125339eea1cef3fb1dd545ce11239c8f3d6f278989a39
- UpgradeCap:   0x4fc3826bdcd7639ef2e43cb4362e9749c71751b596150109ff9b26077f507bf1
- Module: floe · Share token: FLOE

## v0 — SUPERSEDED (naming wart: token was `vault::VAULT`)
- Package ID: 0x3317bc83fcbfb208158a123729a38810623c8de6abb650289a0832982a76d34b
- Kept on chain (immutable); not referenced. Superseded by v1 rename.

## Live Vault<DUSDC> instance (2026-05-22)
- Vault (shared): 0x00b83daae3cee3e706d9479a90ae4375d16932751cc87db567b2bca84c40f0fd
- OperatorCap:    0x1b5d89db5d5f276b85491a90d5c5f050999f6fe414123670c7b56ac41fad6165
- RebalancerCap:  0x1dd8e85d4302fe4f2bedee032cf05d81faa633da15530a5e7097ec9761d4be47
- create_vault tx: HR1VQfi8LENYYonoKcpDp7pS5P143YZhLBKohUH2txrz

## v2 (CANONICAL, 2026-05-29) — authorize_range funds-from-idle fix
- Package:       0x2f8f55dacfcac4f0b9d56cf3cfc3fd560dc2ee7d70552947fd8aacc384bd4d09
- Vault<DUSDC>:  0x5629a0ff2e9945a9b00dd04f8aecdf38e3032954a4c48349605e446839365100
- OperatorCap:   0xc3cdd83bb1a3ab0175750fbe2cf3d75084dac613a0d5c7b7a30c923e744033c6
- RebalancerCap: 0x1da2511c85e2ea45f7b989b60a923eac4712aca1f983a2612d6b97af02ea55f8
- UpgradeCap:    0x2face6a77fed3daefb57c51307bf3b92506e8cbbdf607e42de890ebbe011251b
- TreasuryCap:   0xb3b483c88649c930ed3cdbce07f0da89912115953a59c7aac3c48c8d64aa9342
- v1 (superseded): 0x262094a5... (authorize_range had no funding path)

## v3 (PLATFORM, 2026-05-XX) — factory-deployed, Vault<Q,S>, policy+fees+registry
- floe package:   0x0fd9662dc900bce48de57a9d1ac6e98d02ff1ce4b1f49b2393e4a776b40d8a9d
- VaultRegistry:  0xb1fe225b5e712b8ee2c51a7e76ac0c27732a29834367883004ce358ccb9b1762
- UpgradeCap:     0xe3f3762eddf5e0cbafb5762baab8d374eebae60397d350fd2993c1ccba06ff20
- Reference vault (Floe Stratos), first factory deploy (tx 7DGQtf7BLQGBAekcvoD7CfLpRSULocD2aiX887QiPGQ):
  - Vault<DUSDC,SHARE>: 0xea332cc1ae1a4d0903240bc3a65cea4b0894e6a78d4c10b3153cec79a9a8bfbe
  - OwnerCap:    0x96dd8474eea55f9c7602789e6310b064b9b96549edb3123d2f070e74d4868103
  - CuratorCap:  0xd197c4984907a8d2d9bc432c23281073b490089b91e3511d51dd373dea9e12a8
  - ExecCap:     0x8671ff2e5668b00aa40eb2d7c903e3d239994ccc27577139d6b33d6e26f12aef
  - Share pkg:   0xf49b15cd71c0a9cb7a63ddbcd3a425ec3942ce953a0a3b40b4c0f5f0767f8c23 (::share::SHARE)
  - Share TreasuryCap (consumed into vault): 0xa0edc224...
- Policy: allowed oracle = BTC Jun-5 (0xb795...), max_pos 1000, max_exp 10000, 3x lev, all strata, 50% floor
- Fees: 2% mgmt, 20% perf, recipient = deployer
