import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const owner = '0x9a249cb07dbe8bbdf4b880255c72ed103a995bd390a72903b26797f51e366216';
const obj = await sui.getOwnedObjects({
  owner,
  filter: { StructType: '0x2::package::UpgradeCap' },
  options: { showContent: true },
});
for (const o of obj.data as any[]) {
  const pkg = (o.data?.content as any)?.fields?.package;
  console.log('UpgradeCap', o.data.objectId, '-> package', pkg);
}
