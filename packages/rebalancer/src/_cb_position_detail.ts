import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const posTable = '0x8cdda18ada434e5551174e36dcb4c6ddf7819161e65971920ef307fa571b3e91';
const dfs = await sui.getDynamicFields({ parentId: posTable });
for (const d of dfs.data) {
  const o: any = await sui.getDynamicFieldObject({ parentId: posTable, name: d.name });
  const f = o.data?.content?.fields?.value?.fields ?? o.data?.content?.fields ?? {};
  console.log('position', (d.name?.value ?? '').slice(0,14)+'…', '| mark_value_cached:', f.mark_value_cached, '| size:', f.size, '| premium_paid:', f.premium_paid);
}
