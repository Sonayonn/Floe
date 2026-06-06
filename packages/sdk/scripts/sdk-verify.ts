import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { FLOE_ADDRESSES, FLOE_VERSION } from '../src/index.ts';
const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const a = FLOE_ADDRESSES.testnet;
const MUST_REACH = ['deposit','withdraw','request_redeem_shares','fulfill_redeems','claim_redeem','settle_position','update_nav_attested','register_attester','register_enclave','record_walrus_blob','authorize_agent','revoke_agent','set_paused','guardian_halt','guardian_veto_agent'];
async function liveFns(pkg: string, mod: string): Promise<string[]> {
  const m: any = await sui.getNormalizedMoveModule({ package: pkg, module: mod });
  return Object.keys(m.exposedFunctions);
}
(async () => {
  let fail = false;
  const core = await liveFns(a.package, a.module);
  console.log(`core ${a.package.slice(0,10)}… (FLOE_VERSION ${FLOE_VERSION})`);
  for (const f of MUST_REACH) { const ok = core.includes(f); if (!ok) fail = true; console.log(`  ${ok ? '✓' : '✗ MISSING'} ${f}`); }
  const nav = await liveFns(a.nav.package, 'floe_nav');
  for (const f of ['verify_nav','verify_vol_attested','verify_collateral_attested']) { const ok = nav.includes(f); if (!ok) fail = true; console.log(`  ${ok ? '✓' : '✗ MISSING'} floe_nav::${f}`); }
  console.log(fail ? '\nSDK VERIFY: FAIL' : '\nSDK VERIFY: OK');
  process.exit(fail ? 1 : 0);
})();
