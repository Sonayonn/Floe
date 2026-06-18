/** Floe protocol version (semantic). 0.x = pre-mainnet; 1.0.0 reserved for mainnet launch. */
export const FLOE_VERSION = '0.13.0';

/** Floe canonical on-chain addresses (testnet). Single source of truth — the SDK
 *  and any "build on Floe" consumer reference these, never hardcoded literals. */
export const FLOE_ADDRESSES = {
  testnet: {
    // Core vault layer (factory, registry, treasury, agents)
    package:       '0x260c7074d9c995bcc3c3b1ba4aa872ed05ea221f8ef4c3057d0efe30ef765f83', // V10 (async redemption; settlement-aware NAV + circuit breaker)
    packageOriginal: '0x1aacf4f9f787807d811c058e4a3194f48b2ad30f50096c0713668b656bbd6003', // TRUE genesis publish (type-origin verified) — Seal packageId namespace
    module:        'floe',
    registry:      '0x3462badecc7b4274b222f3b2bf0f0ddab572c294336ec8e7c7d62f42bf1a2f45',
    refVault:      '0xea33fe41c7512a1a36be417b0ce400ada0db0d9fe54f2ade75662aaef987de2e', // live Stratos vault (seed until registry-deployed vaults populate)
    // Verified on-chain: Vault<DUSDC, SHARE> type args (from the live Stratos objType)
    refVaultQType: '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC',
    refVaultSType: '0x120c29a65c10ada7619429e46a608531cfcb4affe14439ca6838aaa77dfd029f::share::SHARE',
    treasury:      '0x756dbb6350b61e838afcb81fd1c53975af7b51756f6cc0f6d1981b7df8b2639e',
    agentRegistry: '0xabf57ae9db406f0c74922e1857da855f00fcb2396ec4ccece9af8af5ffd06ba9',

    // Attestation — the moat (Nautilus hardware-attested NAV + vol)
    nav: {
      packageOriginal: '0xc9bae1737b1744108491f6c4d7c87128520d6b61151d9e3bc23c262cbc0026e0',
      package:         '0x07677cefab304e5d27d8e2dc4aed20a6ef0f9b8bbadf25de67f61a574a658d7a', // V3 (Verifiable Valuation: nav+vol+collateral)
      module:          'floe_nav',
      enclavePackage:  '0x8ecf22e78c90c3e32833d76d82415d7e4227ea370bec4efdad4c4830cbda9e49',
      cap:             '0xe84af0541528abaa11123a2b5a9c9cbee0c4ac18104c4ca3f1a6b3050cb72c9f',
      enclaveConfig:   '0x34e27a1bb7034cc6734c59b631e2362ef5515cd9d139871d8653c584825b7402',
      enclave:         '0x23f37e2f2f642d1e1c11c1cb94ab98156b1a8943d28775dac62a4ea4a24783fd', // live (b4d53224 enclave — +sign_collateral)
      otwType:         '0xc9bae1737b1744108491f6c4d7c87128520d6b61151d9e3bc23c262cbc0026e0::floe_nav::FLOE_NAV',
      navIntent: 1,
      volIntent: 2,
      collateralIntent: 3,
      pcr0: 'b4d532247e4750b239548897063dba140995db04529f9aceea5936f139f2c031e43871b1b69418d86822e72b0f0d6cab',
    },

    // On-chain implied-volatility index (from DeepBook Predict SVI oracle)
    vol: {
      package:  '0xb94fb487c4e3068869c0f1d2b7df013aba7d15fcbabbe0834d966bc546ae2c10',
      module:   'floe_vol_index',
      volIndex: '0x114b2934a04bb9e063bc368ffd6cba06fd821dd54edadd48e5e118e7b57f119a',
    },

    // Floe Lend — attested-collateral money market (SHARE as productive collateral)
    lend: {
      package:           '0x5135151fc146fff78fe52845d683e355453e86d1ae1d5adb5d6b19a3c878b992',
      module:            'floe_lend',
      collateralIntent:  3,     // CollateralPayload — same intent as floe_nav
      // reuses the LIVE enclave attester (proved on Nitro HW). register on each pool.
      attesterPubkey:    'f068812694d6dfd26f9d9b29ad325d38e334bfe2ad90e1bb1eee7c3da87f058c',
      valuationFreshMs:  600000, // 10-min window (matches VALUATION_FRESH_MS)
      adminCap:          '0x814292c8ba43a489032e162ba2dc642eb01f35aec9752d1ecbe293c9eb3dfaa9',
      upgradeCap:        '0x90f9c8dd12a9ea47b95ac193918ca78d4754cf506e62d6e87ac0566fd34fad72',
      refPool:           '0x7c929f24cb579c7c86fec0b29f8b1496a7f4f565e3e6755b5136bca2f81754a7', // live Stratos<DUSDC,SHARE> pool
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

/** Sui yield venues a Floe vault can allocate across. Status is honest:
 *  'live' = wired + deployed on testnet; 'mainnet' = adapter exists, ships at mainnet. */
export type VenueStatus = 'live' | 'mainnet';
export interface VenueMeta {
  key: string;
  name: string;
  category: string;
  status: VenueStatus;
  blurb: string;
}
export const FLOE_VENUES: VenueMeta[] = [
  { key: 'deepbook', name: 'DeepBook Predict', category: 'Structured / options', status: 'live',
    blurb: 'Flagship venue. PLP base yield + 1-sigma vertical-range ladder priced off the Block Scholes SVI oracle, with a Margin delta hedge.' },
  { key: 'cetus', name: 'Cetus', category: 'Concentrated liquidity', status: 'live',
    blurb: 'CLMM liquidity provision — concentrated-range positions earning swap fees.' },
  { key: 'idle', name: 'Idle reserve', category: 'Uninvested', status: 'live',
    blurb: 'Quote asset held in the vault BalanceManager — instantly redeemable, counts fully toward the proven floor.' },
  { key: 'lending', name: 'Sui lending', category: 'Money market', status: 'mainnet',
    blurb: 'Overcollateralized lending supply. Adapter implemented; activates at mainnet.' },
];

export interface AssetMeta { type: string; symbol: string; decimals: number; name: string; }
export const FLOE_ASSETS: Record<string, AssetMeta> = {
  '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC':
    { type: '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC', symbol: 'dUSDC', decimals: 6, name: 'Demo USDC' },
  '0x120c29a65c10ada7619429e46a608531cfcb4affe14439ca6838aaa77dfd029f::share::SHARE':
    { type: '0x120c29a65c10ada7619429e46a608531cfcb4affe14439ca6838aaa77dfd029f::share::SHARE', symbol: 'flShare', decimals: 6, name: 'Floe Vault Share' },
};
export function assetFor(type: string): AssetMeta {
  return FLOE_ASSETS[type] ?? { type, symbol: type.split('::').pop() ?? '???', decimals: 6, name: 'Unknown asset' };
}
