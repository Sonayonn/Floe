import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const owner = '0x9a249cb07dbe8bbdf4b880255c72ed103a995bd390a72903b26797f51e366216';
const r = await sui.getOwnedObjects({ owner, filter: { StructType: '0x2::package::UpgradeCap' }, options: { showContent: true } });
for (const c of r.data) {
  const f: any = c.data?.content?.fields;
  if (f?.package === '0xc3400957c89e4be866b31fbb3d7679a5a8723aa789821800c00c245165110f34')
    console.log('FLOE_VOL UpgradeCap:', c.data?.objectId);
}
