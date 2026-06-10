import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const FLOE_PKG = '0x260c7074d9c995bcc3c3b1ba4aa872ed05ea221f8ef4c3057d0efe30ef765f83';
const VAULT = '0xea33fe41c7512a1a36be417b0ce400ada0db0d9fe54f2ade75662aaef987de2e';
const Q = '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC';
const S = '0x120c29a65c10ada7619429e46a608531cfcb4affe14439ca6838aaa77dfd029f::share::SHARE';
const u64 = (b: number[]) => { let v=0n; for (let i=b.length-1;i>=0;i--) v=(v<<8n)+BigInt(b[i]); return v; };
const read = async (fn: string) => {
  const tx = new Transaction();
  tx.moveCall({ target: `${FLOE_PKG}::floe::${fn}`, typeArguments: [Q, S], arguments: [tx.object(VAULT)] });
  const r = await sui.devInspectTransactionBlock({ transactionBlock: tx, sender: '0x9a249cb07dbe8bbdf4b880255c72ed103a995bd390a72903b26797f51e366216' });
  const rv = r.results?.[0]?.returnValues?.[0];
  return rv ? u64(rv[0] as number[]) : null;
};
const nav = await read('nav_lower_bound');
const supply = await read('share_supply');
console.log('nav_lower_bound:', nav?.toString());
console.log('share_supply:', supply?.toString());
