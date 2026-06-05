import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const owner = '0x9a249cb07dbe8bbdf4b880255c72ed103a995bd390a72903b26797f51e366216';
const VAULT = '0xea33fe41c7512a1a36be417b0ce400ada0db0d9fe54f2ade75662aaef987de2e';
const S = '0x120c29a65c10ada7619429e46a608531cfcb4affe14439ca6838aaa77dfd029f::share::SHARE';
const Q = '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC';

const sc = await sui.getCoins({ owner, coinType: S });
console.log('SHARE coins:', sc.data.length, '| total:', sc.data.reduce((a,c)=>a+BigInt(c.balance),0n).toString());
const qc = await sui.getCoins({ owner, coinType: Q });
console.log('DUSDC coins:', qc.data.length, '| total:', qc.data.reduce((a,c)=>a+BigInt(c.balance),0n).toString());

// find a position_id in the vault's positions table (for settle in Act 2)
const v: any = await sui.getObject({ id: VAULT, options: { showContent: true } });
const f = v.data?.content?.fields ?? {};
console.log('position_count:', f.position_count, '| positions table id:', f.positions?.fields?.id?.id);
const posTable = f.positions?.fields?.id?.id;
if (posTable) {
  const dfs = await sui.getDynamicFields({ parentId: posTable });
  console.log('position ids:', dfs.data.map((d:any)=> d.name?.value ?? d.objectId).slice(0,5));
}
