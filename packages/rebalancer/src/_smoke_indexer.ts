import { PREDICT, ORACLES } from './config.ts';
const base = PREDICT.serverUrl;

async function probe(path: string) {
  try {
    const res = await fetch(`${base}${path}`);
    const text = await res.text();
    console.log(`\n${res.status}  ${path}`);
    console.log('  ', text.slice(0, 400).replace(/\n/g, ' '));
  } catch (e: any) {
    console.log(`\nERR  ${path}  ${e.message}`);
  }
}

// Try the likely route shapes
await probe('/');
await probe('/oracles');
await probe('/predicts');
await probe(`/predicts/${PREDICT.objectId}/oracles`);
await probe(`/oracles/${ORACLES.btcJun12}`);
await probe(`/oracles/${ORACLES.btcJun12}/state`);
await probe('/api/oracles');
await probe('/v1/oracles');
