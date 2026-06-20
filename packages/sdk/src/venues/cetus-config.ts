/**
 * Cetus CLMM testnet deployment — VERIFIED ON CHAIN (not from docs).
 *
 * Uses Cetus deploy 0x0868b71c (factory/pool/position layout). Its old factory
 * `create_pool_with_liquidity` needs NO CoinMetadata — which matters because our quote dUSDC
 * (DeepBook Test USDC) is a coin_registry-NATIVE currency with no legacy `0x2::coin::CoinMetadata`
 * object, so the CURRENT Cetus deploy's `pool_creator::create_pool_v2` (CoinMetadata-required) can't
 * be used for it. The old deploy is the path that works with dUSDC.
 *
 * The CORRECT factory::Pools registry is 0xc090b101 (verified type 0x0868b71c::factory::Pools).
 * The prior config had the WRONG one (0x26c855 = an unrelated peripheral 0xf5ff7d5b::clmm_pool::ClmmPools
 * directory), which made create_pool reject arg0 (TypeMismatch). Recovered 2026-06-20 from the Cetus
 * SDK config keyed by this deploy's global_config 0x6f414909.
 *
 * Single package: corePackageId === publishedAt (no separate upgrade id / version split needed here).
 */
export const CETUS_TESTNET = {
  corePackageId: '0x0868b71c0cba55bf0faf6c40df8c179c67a4d0ba0e79965b68b3d72d7dfbf666',  // struct types
  publishedAt: '0x0868b71c0cba55bf0faf6c40df8c179c67a4d0ba0e79965b68b3d72d7dfbf666',    // moveCall targets
  globalConfigId: '0x6f4149091a5aea0e818e7243a13adcfb403842d670b9a2089de058512620687a', // config::GlobalConfig
  poolsRegistryId: '0xc090b101978bd6370def2666b7a31d7d07704f84e833e108a969eda86150e8cf', // factory::Pools (CORRECT)
  // Floe's own pool target is SUI/dUSDC, created via scripts/deploy-cetus-pool.ts.
  // coinTypeB kept as a deploy-cetus.ts default placeholder; real flows pass COIN_A/COIN_B by env.
  coinTypeB: '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC',
  clock: '0x6',
} as const;
