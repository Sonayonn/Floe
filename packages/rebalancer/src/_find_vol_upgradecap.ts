import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const owner = '0x9a249cb07dbe8bbdf4b880255c72ed103a995bd390a72903b26797f51e366216';
const VOL_PKG = '0xc3400957c89e4be866b31fbb3d7679a5a8723aa789821800c00c245165110f34';
// find all UpgradeCap objects owned, show which package each governs
let cursor: string | null = null;
const caps: any[] = [];
do {
  const r = await sui.getOwnedObjects({ owner, filter: { StructType: '0x2::package::UpgradeCap' }, options: { showContent: true }, cursor });
  caps.push(...r.data); cursor = r.hasNextPage ? r.nextCursor as string : null;
} while (cursor);
console.log('UpgradeCaps owned:', caps.length);
for (const c of caps) {
  const f: any = c.data?.content?.fields;
  console.log('  cap', c.data?.objectId.slice(0,12)+'…', '-> package', f?.package);
}
console.log('\nlooking for one governing floe_vol package', VOL_PKG.slice(0,12)+'…');
