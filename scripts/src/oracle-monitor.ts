// scripts/src/oracle-monitor.ts
//
// Polls the Predict server every 60s for newly-activated oracles.
// Persists the last-seen oracle ID set so we only print deltas.
//
// Run with:  pnpm exec tsx src/oracle-monitor.ts
// (Leave it running in a screen/tmux session in the background.)

import 'dotenv/config';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const SERVER = process.env.PREDICT_SERVER_URL!;
const PREDICT_ID = process.env.PREDICT_OBJECT_ID!;
const POLL_INTERVAL_MS = 60_000;
const STATE_FILE = '.oracle-monitor-state.json';

type Oracle = {
  oracle_id: string;
  underlying_asset: string;
  expiry: number;
  min_strike: number;
  tick_size: number;
  status: string;
  activated_at?: number;
};

function loadSeen(): Set<string> {
  if (!existsSync(STATE_FILE)) return new Set();
  try {
    return new Set(JSON.parse(readFileSync(STATE_FILE, 'utf-8')));
  } catch {
    return new Set();
  }
}

function saveSeen(seen: Set<string>) {
  writeFileSync(STATE_FILE, JSON.stringify([...seen]));
}

async function fetchOracles(): Promise<Oracle[]> {
  const res = await fetch(`${SERVER}/predicts/${PREDICT_ID}/oracles`);
  if (!res.ok) throw new Error(`oracles fetch ${res.status}`);
  return res.json() as Promise<Oracle[]>;
}

function fmt(ts: number) {
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

console.log(`Oracle monitor started.`);
console.log(`Server:      ${SERVER}`);
console.log(`Predict ID:  ${PREDICT_ID}`);
console.log(`Poll every:  ${POLL_INTERVAL_MS / 1000}s\n`);

const seen = loadSeen();
console.log(`Previously-seen activated oracles: ${seen.size}\n`);

while (true) {
  try {
    const oracles = await fetchOracles();
    const activated = oracles.filter((o) => o.status === "active");

    if (activated.length === 0 && seen.size === 0) {
      // Quiet idle state — print one dot per poll
      process.stdout.write('.');
    } else {
      // Detect newly-activated
      const fresh = activated.filter((o) => !seen.has(o.oracle_id));
      if (fresh.length > 0) {
        console.log(`\n\n🟢 ${fresh.length} new activated oracle(s) at ${fmt(Date.now())}:`);
        for (const o of fresh) {
          console.log(`  ID:        ${o.oracle_id}`);
          console.log(`  Asset:     ${o.underlying_asset}`);
          console.log(`  Expiry:    ${fmt(o.expiry)}`);
          console.log(`  Strikes:   min ${o.min_strike}, tick ${o.tick_size}`);
          console.log(`  Activated: ${o.activated_at ? fmt(o.activated_at) : 'unknown'}\n`);
          seen.add(o.oracle_id);
        }
        saveSeen(seen);
      }

      // Detect oracles that have left activated state (settled, etc.)
      const stillActive = new Set(activated.map((o) => o.oracle_id));
      const departed = [...seen].filter((id) => !stillActive.has(id));
      if (departed.length > 0) {
        console.log(`\n\n⚪ ${departed.length} oracle(s) no longer activated:`);
        for (const id of departed) {
          console.log(`  ${id}`);
          seen.delete(id);
        }
        saveSeen(seen);
      }
    }
  } catch (err) {
    console.error(`\nError: ${err instanceof Error ? err.message : err}`);
  }

  await sleep(POLL_INTERVAL_MS);
}