import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { CETUS_TESTNET } from '@floe/sdk';

const EXECUTE = process.env.EXECUTE === '1';
const STEP = process.env.STEP ?? 'deploy';
const sui = new SuiClient({ url: process.env.SUI_RPC_URL! });
const { secretKey } = decodeSuiPrivateKey(process.env.SUI_PRIVATE_KEY!);
const kp = Ed25519Keypair.fromSecretKey(secretKey);
const addr = kp.toSuiAddress();
const C = CETUS_TESTNET as any;

const POOL = '0x17fd50d35d1c2de65c37d2c9745a79de34433e43742f176f91bca580362e8b98';
const ETH = `${C.faucetPackageId}::eth::ETH`;   // coin A
const SUI_T = '0x2::sui::SUI';                    // coin B
const ETH_SUPPLY = '0x093839657619586c99aa4ab883df94919be0a03eff6ee8206c0d546b2853e158';

async function run(tx: Transaction, label: string) {
  tx.setSender(addr);
  if (!EXECUTE) {
    const r = await sui.dryRunTransactionBlock({ transactionBlock: await tx.build({ client: sui }) });
    console.log(`[DRY] ${label}:`, r.effects.status.status, r.effects.status.error ?? '');
    for (const c of (r.objectChanges ?? []) as any[]) if (c.type==='created') console.log('   +', (c.objectType||'').replace(/0x[0-9a-f]{8,}/g,m=>m.slice(0,10)+'..'));
  } else {
    const r = await sui.signAndExecuteTransaction({ signer: kp, transaction: tx, options:{ showObjectChanges:true, showEffects:true }});
    console.log(`[EXEC] ${label}:`, r.digest, r.effects?.status?.status);
    for (const c of (r.objectChanges ?? []) as any[]) if (c.type==='created' && /position::Position/.test(c.objectType||'')) console.log('   POSITION:', c.objectId);
  }
}

if (STEP === 'faucet') {
  const tx = new Transaction();
  tx.moveCall({ target: `${C.faucetPackageId}::eth::faucet`, arguments: [tx.object(ETH_SUPPLY)] });
  await run(tx, 'faucet ETH');
}

if (STEP === 'deploy') {
  const pool = await sui.getObject({ id: POOL, options:{ showContent:true }});
  const pf:any = (pool.data?.content as any)?.fields ?? {};
  const bits = Number(pf.current_tick_index?.fields?.bits ?? 0);
  const curTick = bits >= 0x80000000 ? bits-0x100000000 : bits;
  const sp = 2;
  const align = (t:number)=> Math.round(t/sp)*sp;
  const tickLower = align(curTick) - sp*100;
  const tickUpper = align(curTick) + sp*100;
  const enc = (t:number)=> t<0 ? t+0x100000000 : t;
  console.log(`curTick=${curTick} range=[${tickLower},${tickUpper}]`);

  const ethCoins = await sui.getCoins({ owner: addr, coinType: ETH });
  console.log(`have ETH:${ethCoins.data.reduce((a,c)=>a+BigInt(c.balance),0n)}`);
  if (!ethCoins.data.length) { console.log('faucet ETH first: STEP=faucet EXECUTE=1'); process.exit(0); }

  const tx = new Transaction();
  const amountETH = 100_000n; // fix this much ETH (coin A); small
  const position = tx.moveCall({
    target: `${C.corePackageId}::pool::open_position`,
    typeArguments: [ETH, SUI_T],
    arguments: [tx.object(C.globalConfigId), tx.object(POOL), tx.pure.u32(enc(tickLower)), tx.pure.u32(enc(tickUpper))],
  });
  const receipt = tx.moveCall({
    target: `${C.corePackageId}::pool::add_liquidity_fix_coin`,
    typeArguments: [ETH, SUI_T],
    arguments: [tx.object(C.globalConfigId), tx.object(POOL), position, tx.pure.u64(amountETH), tx.pure.bool(true), tx.object(C.clock)],
  });
  // ETH from faucet coin, SUI from gas
  const ethPrimary = tx.object(ethCoins.data[0].coinObjectId);
  const balA = tx.moveCall({ target:'0x2::coin::into_balance', typeArguments:[ETH], arguments:[ethPrimary] });
  const [suiForLp] = tx.splitCoins(tx.gas, [tx.pure.u64(50_000_000n)]); // 0.05 SUI buffer
  const balB = tx.moveCall({ target:'0x2::coin::into_balance', typeArguments:[SUI_T], arguments:[suiForLp] });
  tx.moveCall({
    target: `${C.corePackageId}::pool::repay_add_liquidity`,
    typeArguments: [ETH, SUI_T],
    arguments: [tx.object(C.globalConfigId), tx.object(POOL), balA, balB, receipt],
  });
  tx.transferObjects([position], addr);
  await run(tx, 'open ETH/SUI position');
}
