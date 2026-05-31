import 'dotenv/config';
import { Transaction } from '@mysten/sui/transactions';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { makeSuiClient } from './lib/sui.js';

// v3 IDs
const FLOE_PKG  = '0x0fd9662dc900bce48de57a9d1ac6e98d02ff1ce4b1f49b2393e4a776b40d8a9d';
const REGISTRY  = '0xb1fe225b5e712b8ee2c51a7e76ac0c27732a29834367883004ce358ccb9b1762';   // <-- from the curl above
const SHARE_TREASURY = '0xa0edc22467b79490c2ba61b6963bf6baaf821a375d4f87ff0f399d74be857b3a';
const SHARE_TYPE = '0xf49b15cd71c0a9cb7a63ddbcd3a425ec3942ce953a0a3b40b4c0f5f0767f8c23::share::SHARE';
const DUSDC     = '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC';
const BALANCE_MANAGER = '0x0b97374737d16df78ed7528d02a7a8f95c3c5235de5b023af749418bed90903b';
const PREDICT_MANAGER = '0x6ea452565c5ef3916c10f899dae0a307beb1d3dda0b59fabc08a7f315a7373ab';
const CLOCK = '0x6';

// Reference vault policy: allow the BTC Jun-5 oracle we mint against, all strata on.
const ALLOWED_ORACLE = '0xb79524498a9947307e192d8045772150dc47aade4f9e09bd4b6fe3236b9e3125';

const suiClient = await makeSuiClient();
const { secretKey } = decodeSuiPrivateKey(process.env.SUI_PRIVATE_KEY!);
const keypair = Ed25519Keypair.fromSecretKey(secretKey);
const address = keypair.toSuiAddress();

const tx = new Transaction();

// new_policy(allowed_oracles, max_position_size, max_total_exposure, max_leverage_bps, enabled_strata, plp_floor_bps)
const policy = tx.moveCall({
  target: `${FLOE_PKG}::floe::new_policy`,
  arguments: [
    tx.makeMoveVec({ type: '0x2::object::ID', elements: [tx.pure.id(ALLOWED_ORACLE)] }),
    tx.pure.u64(1_000_000_000),   // max_position_size = 1000 DUSDC
    tx.pure.u64(10_000_000_000),  // max_total_exposure = 10000 DUSDC
    tx.pure.u64(30_000),          // max_leverage_bps = 3x
    tx.pure.u8(7),                // enabled_strata = PLP|RANGE|HEDGE
    tx.pure.u64(5_000),           // plp_floor_bps = 50%
  ],
});

// new_fees(management_fee_bps, performance_fee_bps, fee_recipient)
const fees = tx.moveCall({
  target: `${FLOE_PKG}::floe::new_fees`,
  arguments: [tx.pure.u64(200), tx.pure.u64(2_000), tx.pure.address(address)], // 2% mgmt, 20% perf
});

// deploy_vault<DUSDC, SHARE>(registry, share_treasury, bm_id, pm_id, policy, fees, name, kind, clock)
const [ownerCap, curatorCap] = tx.moveCall({
  target: `${FLOE_PKG}::floe::deploy_vault`,
  typeArguments: [DUSDC, SHARE_TYPE],
  arguments: [
    tx.object(REGISTRY),
    tx.object(SHARE_TREASURY),
    tx.pure.id(BALANCE_MANAGER),
    tx.pure.id(PREDICT_MANAGER),
    policy,
    fees,
    tx.pure.string('Floe Stratos'),
    tx.pure.string('stratos'),
    tx.object(CLOCK),
  ],
});

tx.transferObjects([ownerCap, curatorCap], address);

const res = await suiClient.signAndExecuteTransaction({
  signer: keypair, transaction: tx,
  options: { showObjectChanges: true, showEffects: true },
});
console.log('Deploy tx:', res.digest, res.effects?.status?.status);
for (const c of res.objectChanges ?? []) {
  if (c.type === 'created') console.log('  created', (c as any).objectType, '\n    ', (c as any).objectId);
}
