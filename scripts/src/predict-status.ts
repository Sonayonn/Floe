// scripts/src/predict-status.ts
import 'dotenv/config';

const SERVER = process.env.PREDICT_SERVER_URL!;
const PREDICT_ID = process.env.PREDICT_OBJECT_ID!;

console.log(`Predict server: ${SERVER}`);
console.log(`Predict obj:    ${PREDICT_ID}\n`);

// ─── 1. Server health ────────────────────────────────────────────────────────
console.log('▶ /status');
const status = await fetch(`${SERVER}/status`).then((r) => r.json());
console.log(status);

// ─── 2. Predict object state — global config ─────────────────────────────────
console.log('\n▶ /predicts/:id/state');
const state = await fetch(`${SERVER}/predicts/${PREDICT_ID}/state`).then((r) => r.json());
console.log(JSON.stringify(state, null, 2).slice(0, 2000));

// ─── 3. List of oracles available on this Predict ────────────────────────────
console.log('\n▶ /predicts/:id/oracles');
const oracles = await fetch(`${SERVER}/predicts/${PREDICT_ID}/oracles`).then((r) => r.json());
console.log(JSON.stringify(oracles, null, 2).slice(0, 2000));

// ─── 4. Accepted quote assets ────────────────────────────────────────────────
console.log('\n▶ /predicts/:id/quote-assets');
const quotes = await fetch(`${SERVER}/predicts/${PREDICT_ID}/quote-assets`).then((r) => r.json());
console.log(JSON.stringify(quotes, null, 2).slice(0, 1000));

// ─── 5. Vault summary — total LP value, exposure, etc. ───────────────────────
console.log('\n▶ /predicts/:id/vault/summary');
const vault = await fetch(`${SERVER}/predicts/${PREDICT_ID}/vault/summary`).then((r) => r.json());
console.log(JSON.stringify(vault, null, 2).slice(0, 2000));