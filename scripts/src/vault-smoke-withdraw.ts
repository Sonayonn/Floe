import 'dotenv/config';
import { Transaction } from '@mysten/sui/transactions';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { makeSuiClient } from './lib/sui.js';

const PKG = '0x262094a517a978302db1c9462139717478021197c1038984035cd46d2ac0b188';
const VAULT = '0x00b83daae3cee3e706d9479a90ae4375d16932751cc87db567b2bca84c40f0fd';
const DUSDC = '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC';
const FLOE = `${PKG}::floe::FLOE`;
const CLOCK = '0x6';

const suiClient = await makeSuiClient();
const { secretKey } = decodeSuiPrivateKey(process.env.SUI_PRIVATE_KEY!);
const keypair = Ed25519Keypair.fromSecretKey(secretKey);
const address = keypair.toSuiAddress();

// Find FLOE shares to redeem
const floeCoins = await suiClient.getCoins({ owner: address, coinType: FLOE });
if (floeCoins.data.length === 0) throw new Error('No FLOE shares in wallet');
const shareCoin = floeCoins.data[0];
console.log(`Redeeming FLOE coin ${shareCoin.coinObjectId}, balance: ${shareCoin.balance}`);

const tx = new Transaction();
const [dusdcOut] = tx.moveCall({
  target: `${PKG}::floe::withdraw`,
  typeArguments: [DUSDC],
  arguments: [tx.object(VAULT), tx.object(shareCoin.coinObjectId), tx.object(CLOCK)],
});
tx.transferObjects([dusdcOut], address);

const res = await suiClient.signAndExecuteTransaction({
  signer: keypair, transaction: tx,
  options: { showBalanceChanges: true },
});
console.log('\nWITHDRAW tx:', res.digest);
console.log('Explorer:', `https://suiscan.xyz/testnet/tx/${res.digest}`);
for (const b of res.balanceChanges ?? []) {
  if (b.coinType.includes('FLOE')) console.log('  FLOE burned:', b.amount);
  if (b.coinType === DUSDC) console.log('  DUSDC returned:', b.amount);
}

const vaultObj = await suiClient.getObject({ id: VAULT, options: { showContent: true } });
const fields = (vaultObj.data?.content as any)?.fields;
console.log('\nVault state after withdraw:');
console.log('  share_supply:', fields?.share_supply, '(should be 0)');
console.log('  idle balance:', fields?.idle, '(should be 0)');