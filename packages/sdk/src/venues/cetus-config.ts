/**
 * Cetus CLMM testnet deployment — VERIFIED ON CHAIN (not from docs).
 * The SDK-published global_config (0xe1f3db32) belongs to the config/peripheral
 * package, NOT the CLMM core; passing it would fail every call. These IDs were
 * confirmed by resolving each object's type against the core package 0x0868b71c.
 */
export const CETUS_TESTNET = {
  corePackageId: '0x0868b71c0cba55bf0faf6c40df8c179c67a4d0ba0e79965b68b3d72d7dfbf666',
  globalConfigId: '0x6f4149091a5aea0e818e7243a13adcfb403842d670b9a2089de058512620687a',
  poolsRegistryId: '0x26c85500f5dd2983bf35123918a144de24e18936d0b234ef2b49fbb2d3d6307d',
  samplePoolId: '0xbed3136f15b0ea649fb94bcdf9d3728fb82ba1c3e189bf6062d78ff547850054',
  coinTypeA: '0x26b3bc67befc214058ca78ea9a2690298d731a2d4309485ec3d40198063c4abc::usdt::USDT',
  coinTypeB: '0x26b3bc67befc214058ca78ea9a2690298d731a2d4309485ec3d40198063c4abc::cetus::CETUS',
  // Faucet Supply objects (verified from live faucet calls) for testnet test coins.
  faucetPackageId: '0x26b3bc67befc214058ca78ea9a2690298d731a2d4309485ec3d40198063c4abc',
  cetusSupplyId: '0x69b39c6651af6db65f4edbef528c8d0dc2c4516c39450e781f0c5750d440374d',
  usdtSupplyId: '0x0a842204e4a64afe0da14749443754714343d1d9d246d71080bde331fc22de55',
  // The live USDT/CETUS pool: coin A = USDT, coin B = CETUS.
  clock: '0x6',
} as const;
