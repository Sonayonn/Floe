import { SuiClient } from '@mysten/sui/client';
const sui = new SuiClient({ url: process.env.SUI_RPC_URL! });
const ENCLAVE = '0x3b009f952e11f0fa0612d0a8e07461fb69edc355d732e5d6e39267b1b4fd7138';
const mods = await sui.getNormalizedMoveModulesByPackage({ package: ENCLAVE });
const m = (mods as any)['enclave'];
// list ALL functions incl. test-only won't show via RPC (only public/entry), but
// check for any public test helper / constructor that makes an Enclave
console.log('all public fns:', Object.keys(m.exposedFunctions).join(', '));
// look for anything that returns Enclave or takes raw pk (test constructor)
for (const [name, f] of Object.entries(m.exposedFunctions) as any) {
  const ret = JSON.stringify((f as any).return_ ?? null);
  if (/Enclave/.test(ret)) console.log(`  ${name} RETURNS Enclave`);
}
