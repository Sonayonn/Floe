import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { CETUS_TESTNET } from '@floe/sdk';

const EXECUTE = process.env.EXECUTE === '1';
const STEP = process.env.STEP ?? 'faucet'; // 'faucet' then 'deploy'
const sui = new SuiClient({ url: process.env.SUI_RPC_URL! });
const { secretKey } = decodeSuiPrivateKey(process.env.SUI_PRIVATE_KEY!);
const kp = Ed25519Keypair.fromSecretKey(secretKey);
const addr = kp.toSuiAddress();
const C = CETUS_TESTNET as any;
const POOL = '0xbed3136f15b0ea649fb94bcdf9d3728fb82ba1c3e189bf6062d78ff547850054';
const USDT = `${C.faucetPackageId}::usdt::USDT`;
const CETUS = `${C.faucetPackageId}::cetus::CETUS`;

async function run(tx: Transaction, label: string) {
  tx.setSender(addr);
  if (!EXECUTE) {
    const r = await sui.dryRunTransactionBlock({ transactionBlock: await tx.build({ client: sui }) });
    console.log(`[DRY] ${label}:`, r.effects.status.status, r.effects.status.error ?? '');
    for (const c of (r.objectChanges ?? []) as any[]) if (c.type==='created') console.log('   +', (c.objectType||'').replace(/0x[0-9a-f]{8,}/g,m=>m.slice(0,10)+'..'));
  } else {
    const r = await sui.signAndExecuteTransaction({ signer: kp, transaction: tx, options:{ showObjectChanges:true, showEffects:true }});
    console.log(`[EXEC] ${label}:`, r.digest, r.effects?.status?.status);
    for (const c of (r.objectChanges ?? []) as any[]) if (c.type==='created') console.log('   +', c.objectType?.slice(0,60), c.objectId);
  }
}

if (STEP === 'faucet') {
  const tx = new Transaction();
  tx.moveCall({ target: `${C.faucetPackageId}::usdt::faucet`, arguments: [tx.object(C.usdtSupplyId)] });
  tx.moveCall({ target: `${C.faucetPackageId}::cetus::faucet`, arguments: [tx.object(C.cetusSupplyId)] });
  await run(tx, 'faucet USDT+CETUS');
}

if (STEP === 'deploy') {
  // read current tick to set a valid range
  const pool = await sui.getObject({ id: POOL, options:{ showContent:true }});
  const pf:any = (pool.data?.content as any)?.fields ?? {};
  const bits = Number(pf.current_tick_index?.fields?.bits ?? 0);
  const curTick = bits >= 0x80000000 ? bits - 0x100000000 : bits;
  const sp = 60;
  const align = (t:number)=> Math.round(t/sp)*sp;
  const tickLower = align(curTick) - sp*20;
  const tickUpper = align(curTick) + sp*20;
  const enc = (t:number)=> t<0 ? t+0x100000000 : t;
  console.log(`pool curTick=${curTick} range=[${tickLower},${tickUpper}]`);

  const usdtCoins = await sui.getCoins({ owner: addr, coinType: USDT });
  const cetusCoins = await sui.getCoins({ owner: addr, coinType: CETUS });
  console.log(`have USDT:${usdtCoins.data.reduce((a,c)=>a+BigInt(c.balance),0n)} CETUS:${cetusCoins.data.reduce((a,c)=>a+BigInt(c.balance),0n)}`);
  if (!usdtCoins.data.length || !cetusCoins.data.length) { console.log('need to faucet first (STEP=faucet EXECUTE=1)'); process.exit(0); }

  const tx = new Transaction();
  const amountUSDT = 1_000_000n; // fix this much USDT (coin A)
  const position = tx.moveCall({
    target: `${C.corePackageId}::pool::open_position`,
    typeArguments: [USDT, CETUS],
    arguments: [tx.object(C.globalConfigId), tx.object(POOL), tx.pure.u32(enc(tickLower)), tx.pure.u32(enc(tickUpper))],
  });
  const receipt = tx.moveCall({
    target: `${C.corePackageId}::pool::add_liquidity_fix_coin`,
    typeArguments: [USDT, CETUS],
    arguments: [tx.object(C.globalConfigId), tx.object(POOL), position, tx.pure.u64(amountUSDT), tx.pure.bool(true), tx.object(C.clock)],
  });
  // how much of each owed
  const payA = tx.moveCall({ target: `${C.corePackageId}::pool::add_liquidity_pay_amount`, typeArguments:[USDT,CETUS], arguments:[receipt] });
  // settle: split owed from our coins, into_balance, repay
  const usdtPrimary = tx.object(usdtCoins.data[0].coinObjectId);
  const cetusPrimary = tx.object(cetusCoins.data[0].coinObjectId);
  const balA = tx.moveCall({ target:'0x2::coin::into_balance', typeArguments:[USDT], arguments:[usdtPrimary] });
  const balB = tx.moveCall({ target:'0x2::coin::into_balance', typeArguments:[CETUS], arguments:[cetusPrimary] });
  tx.moveCall({
    target: `${C.corePackageId}::pool::repay_add_liquidity`,
    typeArguments: [USDT, CETUS],
    arguments: [tx.object(C.globalConfigId), tx.object(POOL), balA, balB, receipt],
  });
  tx.transferObjects([position], addr);
  await run(tx, 'open Cetus position');
}
