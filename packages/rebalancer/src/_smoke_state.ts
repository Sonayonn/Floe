import { PREDICT, ORACLES } from './config.ts';

const res = await fetch(`${PREDICT.serverUrl}/oracles/${ORACLES.btcJun12}/state`);
const json = await res.json();
console.log('Full /state response:');
console.log(JSON.stringify(json, null, 2));
