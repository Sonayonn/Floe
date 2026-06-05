/** Floe protocol version (semantic). 0.x = pre-mainnet; 1.0.0 reserved for mainnet launch. */
export const FLOE_VERSION = '0.8.0';

/** Floe canonical on-chain addresses (testnet). Single source of truth — the SDK
 *  and any "build on Floe" consumer reference these, never hardcoded literals. */
export const FLOE_ADDRESSES = {
  testnet: {
    // Core vault layer (factory, registry, treasury, agents)
    package:       '0x4a6db5eda3ed6897ccd34b0d971110a11d123a6188d5973b8bcd539e5a5fa50e', // V8 (circuit breaker)
    packageOriginal: '0x1aacf4f9f787807d811c058e4a3194f48b2ad30f50096c0713668b656bbd6003', // TRUE genesis publish (type-origin verified) — Seal packageId namespace
    module:        'floe',
    registry:      '0x3462badecc7b4274b222f3b2bf0f0ddab572c294336ec8e7c7d62f42bf1a2f45',
    treasury:      '0x756dbb6350b61e838afcb81fd1c53975af7b51756f6cc0f6d1981b7df8b2639e',
    agentRegistry: '0xabf57ae9db406f0c74922e1857da855f00fcb2396ec4ccece9af8af5ffd06ba9',

    // Attestation — the moat (Nautilus hardware-attested NAV + vol)
    nav: {
      packageOriginal: '0xc9bae1737b1744108491f6c4d7c87128520d6b61151d9e3bc23c262cbc0026e0',
      package:         '0xfd5a822ad199dd4d07d7fba532b37f2aef5843178af42ed193132554923fda73',
      module:          'floe_nav',
      enclavePackage:  '0x8ecf22e78c90c3e32833d76d82415d7e4227ea370bec4efdad4c4830cbda9e49',
      cap:             '0xe84af0541528abaa11123a2b5a9c9cbee0c4ac18104c4ca3f1a6b3050cb72c9f',
      enclaveConfig:   '0x34e27a1bb7034cc6734c59b631e2362ef5515cd9d139871d8653c584825b7402',
      enclave:         '0x1606c150ece04642d8ae50e944377d9217c80f6bd08433dccd1b665838184584',
      otwType:         '0xc9bae1737b1744108491f6c4d7c87128520d6b61151d9e3bc23c262cbc0026e0::floe_nav::FLOE_NAV',
      navIntent: 1,
      volIntent: 2,
      pcr0: '6ee108f6896926ab3dc1ee0edd3c1fdec1a48e958cc4a168d3ef3fb75f5f80181eeb0ee8c96cd466644cd7a81155df8a',
    },

    // On-chain implied-volatility index (from DeepBook Predict SVI oracle)
    vol: {
      package:  '0xc3400957c89e4be866b31fbb3d7679a5a8723aa789821800c00c245165110f34',
      module:   'floe_vol_index',
      volIndex: '0x114b2934a04bb9e063bc368ffd6cba06fd821dd54edadd48e5e118e7b57f119a',
    },

    // DeepBook Predict (flagship venue + the vol oracle source)
    predict: {
      package:        '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138',
      object:         '0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a',
      manager:        '0x6ea452565c5ef3916c10f899dae0a307beb1d3dda0b59fabc08a7f315a7373ab',
      balanceManager: '0x0b97374737d16df78ed7528d02a7a8f95c3c5235de5b023af749418bed90903b',
      btcOracle:      '0xb79524498a9947307e192d8045772150dc47aade4f9e09bd4b6fe3236b9e3125',
    },

    seal: {
      // Open-mode independent testnet key servers (no API keys; accept any package).
      // Source: seal-docs.wal.app/UsingSeal (verified current).
      keyServers: [
        '0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75',
        '0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8',
      ],
      threshold: 2,
    },
    clock: '0x6',
  },
} as const;
export type FloeNetwork = keyof typeof FLOE_ADDRESSES;

/** Scaling constants — must mirror the contracts. */
export const INITIAL_SHARE_PRICE = 1_000_000n;   // 1.0 @ 6dp
export const PLP_PRICE_SCALE = 1_000_000_000n;    // 9dp (SVI/vol scale too)
export const BPS_DENOM = 10_000n;
