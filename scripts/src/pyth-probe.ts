import 'dotenv/config';
import { SuiPriceServiceConnection } from '@pythnetwork/pyth-sui-js/SuiPriceServiceConnection';
import { SuiPythClient } from '@pythnetwork/pyth-sui-js/client';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

// Sui testnet Pyth + Wormhole state objects
const PYTH_STATE = '0xd3e79c2c083b934e78b3bd58a490ec6b092561954da6e7322e1e2b3c8abfddc0';
const WORMHOLE_STATE = '0x31358d198147da50db32eda2562951d53973a0c0ad5ed738e9b17d88b213d790';
const SUI_USD_FEED = '0x50c67b3fd225db8912a424dd4baed60ffdde625ed2feaaf283724f9608fea266';

const { secretKey } = decodeSuiPrivateKey(process.env.SUI_PRIVATE_KEY!);
const keypair = Ed25519Keypair.fromSecretKey(secretKey);
const address = keypair.toSuiAddress();

// Plain SuiClient for both Pyth (needs concrete type) and signing
const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });

// Step 1: fetch signed price update from Hermes testnet (no config object in v3)
const connection = new SuiPriceServiceConnection('https://hermes-beta.pyth.network');
const priceUpdateData = await connection.getPriceFeedsUpdateData([SUI_USD_FEED]);
console.log('Fetched price update buffers:', priceUpdateData.length);

// Step 2: build PTB that posts the update
const tx = new Transaction();
const pythClient = new SuiPythClient(suiClient, PYTH_STATE, WORMHOLE_STATE);
const priceInfoObjectIds = await pythClient.updatePriceFeeds(tx, priceUpdateData, [SUI_USD_FEED]);
console.log('PriceInfoObject IDs:', priceInfoObjectIds);

const res = await suiClient.signAndExecuteTransaction({
  signer: keypair, transaction: tx, options: { showEffects: true },
});
console.log('Pyth update tx:', res.digest);
console.log('Explorer:', `https://suiscan.xyz/testnet/tx/${res.digest}`);
console.log('Status:', res.effects?.status?.status);