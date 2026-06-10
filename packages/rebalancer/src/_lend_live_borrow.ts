import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromHex } from '@mysten/sui/utils';
import { readFileSync } from 'fs';

const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const { secretKey } = decodeSuiPrivateKey(process.env.SUI_PRIVATE_KEY!);
const kp = Ed25519Keypair.fromSecretKey(secretKey);
const ME = kp.toSuiAddress();

const LEND_PKG = '0x5135151fc146fff78fe52845d683e355453e86d1ae1d5adb5d6b19a3c878b992';
const POOL     = '0x7c929f24cb579c7c86fec0b29f8b1496a7f4f565e3e6755b5136bca2f81754a7';
const VAULT    = '0xea33fe41c7512a1a36be417b0ce400ada0db0d9fe54f2ade75662aaef987de2e';
const Q_TYPE   = '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC';
const S_TYPE   = '0x120c29a65c10ada7619429e46a608531cfcb4affe14439ca6838aaa77dfd029f::share::SHARE';

const NAV = 8363773n, SUPPLY = 15905049n;
const v = JSON.parse(readFileSync('../enclave/collat_live.json', 'utf8'));
const TS = BigInt(v.response.timestamp_ms);
const SIG = Array.from(fromHex(v.signature));

async function run(tx: Transaction, label: string) {
  const r = await sui.signAndExecuteTransaction({ signer: kp, transaction: tx, options: { showEffects: true, showObjectChanges: true } });
  console.log(`${label}: ${r.effects?.status?.status} ${r.effects?.status?.error ?? ''} ${r.digest}`);
  return r;
}

// fetch coins
async function pickCoin(type: string, min: bigint): Promise<{id:string,bal:bigint}> {
  const cs = await sui.getCoins({ owner: ME, coinType: type });
  const c = cs.data.find(x => BigInt(x.balance) >= min) ?? cs.data.sort((a,b)=>Number(BigInt(b.balance)-BigInt(a.balance)))[0];
  return { id: c.coinObjectId, bal: BigInt(c.balance) };
}

(async () => {
  console.log('sender:', ME);
  const ts_age = Date.now() - Number(TS);
  console.log(`valuation age: ${(ts_age/1000).toFixed(0)}s (must be < 600s)`);

  // 1) seed the pool with dUSDC liquidity (supply ~5 dUSDC)
  const dusdc = await pickCoin(Q_TYPE, 5_000_000n);
  console.log('dUSDC coin:', dusdc.id, 'bal', dusdc.bal.toString());
  const tx1 = new Transaction();
  const [seed] = tx1.splitCoins(tx1.object(dusdc.id), [tx1.pure.u64(5_000_000)]);
  const pos = tx1.moveCall({
    target: `${LEND_PKG}::floe_lend::supply`,
    typeArguments: [Q_TYPE, S_TYPE],
    arguments: [tx1.object(POOL), seed, tx1.object('0x6')],
  });
  tx1.transferObjects([pos], ME);
  await run(tx1, '1. supply 5 dUSDC');

  // 2) the LIVE attested borrow: lock 5 SHARE, borrow 1 dUSDC
  const share = await pickCoin(S_TYPE, 5_000_000n);
  console.log('SHARE coin:', share.id, 'bal', share.bal.toString());
  const tx2 = new Transaction();
  const [collateral] = tx2.splitCoins(tx2.object(share.id), [tx2.pure.u64(5_000_000)]); // 5 shares
  const [loan, debt] = tx2.moveCall({
    target: `${LEND_PKG}::floe_lend::lock_and_borrow`,
    typeArguments: [Q_TYPE, S_TYPE],
    arguments: [
      tx2.object(POOL), collateral, tx2.pure.u64(1_000_000), // borrow 1 dUSDC
      tx2.pure.address(VAULT), tx2.pure.u64(NAV), tx2.pure.u64(SUPPLY),
      tx2.pure.u64(TS), tx2.pure.vector('u8', SIG), tx2.object('0x6'),
    ],
  });
  tx2.transferObjects([loan, debt], ME);
  const r2 = await run(tx2, '2. LIVE ATTESTED BORROW (lock 5 SHARE, borrow 1 dUSDC)');
  if (r2.effects?.status?.status === 'success') {
    console.log('\n*** FLOE LEND PROVEN LIVE END-TO-END ***');
    console.log('enclave-attested collateral valuation -> on-chain verify -> real borrow');
    for (const c of (r2.objectChanges ?? []) as any[]) {
      if (c.type === 'created' && /DebtPosition/.test(c.objectType || '')) console.log('DEBT POSITION:', c.objectId);
    }
  }
})();
