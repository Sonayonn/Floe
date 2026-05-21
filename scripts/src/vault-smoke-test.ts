import 'dotenv/config';
import { Transaction } from '@mysten/sui/transactions';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { makeSuiClient } from './lib/sui.js';

const PKG = '0x262094a517a978302db1c9462139717478021197c1038984035cd46d2ac0b188';
const VAULT = '0x00b83daae3cee3e706d9479a90ae4375d16932751cc87db567b2bca84c40f0fd';
const DUSDC = '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC';
const CLOCK = '0x6';

const suiClient = await makeSuiClient();
const { secretKey } = decodeSuiPrivateKey(process.env.SUI_PRIVATE_KEY!);
const keypair = Ed25519Keypair.fromSecretKey(secretKey);
const address = keypair.toSuiAddress();

// Find a DUSDC coin in the wallet to deposit
const coins = await suiClient.getCoins({ owner: address, coinType: DUSDC });
if (coins.data.length === 0) throw new Error('No DUSDC coins in wallet');
console.log(`Found ${coins.data.length} DUSDC coin(s), first balance: ${coins.data[0].balance}`);

const DEPOSIT = 5_000_000; // 5 DUSDC (6dp)

// ─── Deposit ───
const tx = new Transaction();
const [coinToDeposit] = tx.splitCoins(tx.object(coins.data[0].coinObjectId), [DEPOSIT]);
const [shares] = tx.moveCall({
  target: `${PKG}::floe::deposit`,
  typeArguments: [DUSDC],
  arguments: [tx.object(VAULT), coinToDeposit, tx.object(CLOCK)],
});
tx.transferObjects([shares], address);

const depRes = await suiClient.signAndExecuteTransaction({
  signer: keypair, transaction: tx,
  options: { showObjectChanges: true, showBalanceChanges: true },
});
console.log('\nDEPOSIT tx:', depRes.digest);
console.log('Explorer:', `https://suiscan.xyz/testnet/tx/${depRes.digest}`);
for (const c of depRes.objectChanges ?? []) {
  if (c.type === 'created' && c.objectType.includes('Coin<') && c.objectType.includes('FLOE'))
    console.log('  FLOE shares received:', c.objectId);
}
for (const b of depRes.balanceChanges ?? []) {
  if (b.coinType.includes('FLOE')) console.log('  FLOE balance change:', b.amount);
}

// ─── Read vault state ───
const vaultObj = await suiClient.getObject({ id: VAULT, options: { showContent: true } });
const fields = (vaultObj.data?.content as any)?.fields;
console.log('\nVault state after deposit:');
console.log('  share_supply:', fields?.share_supply);
console.log('  idle balance:', fields?.idle);