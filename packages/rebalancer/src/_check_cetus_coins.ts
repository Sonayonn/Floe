import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const W = '0x9a249cb07dbe8bbdf4b880255c72ed103a995bd390a72903b26797f51e366216';
for (const [label,t] of [
  ['USDT','0x26b3bc67befc214058ca78ea9a2690298d731a2d4309485ec3d40198063c4abc::usdt::USDT'],
  ['CETUS','0x26b3bc67befc214058ca78ea9a2690298d731a2d4309485ec3d40198063c4abc::cetus::CETUS'],
  ['SUI','0x2::sui::SUI'],
] as const) {
  const bal = await sui.getBalance({ owner: W, coinType: t });
  console.log(`${label}: ${bal.totalBalance}`);
}
