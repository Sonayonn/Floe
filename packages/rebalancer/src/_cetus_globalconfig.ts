import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const CORE = '0x0868b71c0cba55bf0faf6c40df8c179c67a4d0ba0e79965b68b3d72d7dfbf666';

// GlobalConfig is created at package init and shared. Find it by querying objects
// of type CORE::config::GlobalConfig. The simplest reliable path: read the pool's
// dynamic fields / or query owned-by-immutable. We'll use getOwnedObjects won't work
// (it's shared). Instead: the config module's InitConfigEvent carries the id.
// Try reading it from a known-good source: query events by type on the config module.
for (const evType of [`${CORE}::config::InitConfigEvent`, `${CORE}::config::InitEvent`]) {
  try {
    const ev = await sui.queryEvents({ query: { MoveEventType: evType }, limit: 3, order: 'ascending' });
    if (ev.data.length) {
      console.log(evType, '→', JSON.stringify(ev.data[0].parsedJson));
    } else console.log(evType, '→ (no events)');
  } catch(e:any){ console.log(evType, 'err', String(e.message||e).slice(0,60)); }
}

// Fallback: the docs testnet config gave global_config_id = 0xb8893bbf6a5509cf6ee09fd28a89320a203f6c49 (devnet)
// — that's DEVNET. For testnet we need the right one. Probe a couple of candidates:
const cands = [
  '0x9774e359588ead122af1c7e7f64e14ade261cfeecdb5d0eb4a5b3b4c8ab8bd3e',
  '0x6f4149091a5aea0e818e7243a13adcfb403842d670b9a2089de058512620687a',
];
for (const id of cands) {
  try {
    const o = await sui.getObject({ id, options:{ showType:true }});
    console.log('cand', id.slice(0,12), '→', (o.data as any)?.type ?? (o.error as any)?.code);
  } catch(e:any){ console.log('cand', id.slice(0,12), 'err'); }
}
