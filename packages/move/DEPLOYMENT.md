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
