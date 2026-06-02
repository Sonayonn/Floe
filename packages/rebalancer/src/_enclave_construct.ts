import { SuiClient } from '@mysten/sui/client';
const sui = new SuiClient({ url: process.env.SUI_RPC_URL! });
const ENCLAVE = '0x3b009f952e11f0fa0612d0a8e07461fb69edc355d732e5d6e39267b1b4fd7138';
const mods = await sui.getNormalizedMoveModulesByPackage({ package: ENCLAVE });
const m = (mods as any)['enclave'];

// list ALL functions + which RETURN an Enclave (constructors)
console.log('all enclave fns:');
for (const [name, f] of Object.entries(m.exposedFunctions) as any) {
  const ret = JSON.stringify((f as any).return_ ?? null);
  const mkEnclave = /Enclave/.test(ret);
  console.log(`  ${name} [${(f as any).visibility}]${mkEnclave?'  <-- returns Enclave':''}`);
}
// Is there a real registered Enclave on testnet we could borrow/reference for the demo?
// Query recent register_enclave or verify_signature calls.
console.log('\nrecent verify_signature callers (real enclaves in use on testnet):');
try {
  const txs = await sui.queryTransactionBlocks({
    filter:{ MoveFunction:{ package: ENCLAVE, module:'enclave', function:'verify_signature' }},
    options:{ showInput:true }, limit:3, order:'descending',
  });
  console.log(`  ${txs.data.length} recent verify_signature calls found`);
  for (const tx of txs.data as any[]) {
    const inputs = tx.transaction?.data?.transaction?.inputs ?? [];
    for (const i of inputs) if (i.type==='object'&&i.objectId) {
      const o = await sui.getObject({ id:i.objectId, options:{ showType:true }}).catch(()=>null);
      const t = (o?.data as any)?.type ?? '';
      if (/::enclave::Enclave</.test(t)) console.log(`    Enclave object: ${i.objectId}  ${t.slice(-40)}`);
    }
  }
} catch(e:any){ console.log('  query failed:', String(e.message||e).slice(0,50)); }
