// scripts/src/vault-economics-track.ts
//
// Polls the Predict vault summary every 60s, appends a row to data/vault-history.csv.
// Running this for the duration of the hackathon gives us NAV-history data
// for the dashboard chart (W4) and a real "X days of live data" demo claim.

import 'dotenv/config';
import { existsSync, mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const SERVER = process.env.PREDICT_SERVER_URL!;
const PREDICT_ID = process.env.PREDICT_OBJECT_ID!;
const POLL_INTERVAL_MS = 60_000;

const DATA_DIR = 'data';
const CSV_FILE = `${DATA_DIR}/vault-history.csv`;

const HEADERS = [
  'iso_timestamp',
  'unix_ms',
  'vault_balance',
  'vault_value',
  'total_mtm',
  'total_max_payout',
  'available_liquidity',
  'plp_total_supply',
  'plp_share_price',
  'utilization',
  'max_payout_utilization',
  'net_deposits',
  'total_supplied',
  'total_withdrawn',
];

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR);
if (!existsSync(CSV_FILE)) {
  writeFileSync(CSV_FILE, HEADERS.join(',') + '\n');
  console.log(`Created ${CSV_FILE}`);
}

console.log(`Vault tracker started. Polling every ${POLL_INTERVAL_MS / 1000}s.\n`);

while (true) {
  try {
    type VaultSummary = {
      vault_balance: number;
      vault_value: number;
      total_mtm: number;
      total_max_payout: number;
      available_liquidity: number;
      plp_total_supply: number;
      plp_share_price: number;
      utilization: number;
      max_payout_utilization: number;
      net_deposits: number;
      total_supplied: number;
      total_withdrawn: number;
    };

    const res = await fetch(`${SERVER}/predicts/${PREDICT_ID}/vault/summary`);
    if (!res.ok) throw new Error(`status ${res.status}`);
    const s = (await res.json()) as VaultSummary;

    const now = new Date();
    const row = [
      now.toISOString(),
      now.getTime(),
      s.vault_balance,
      s.vault_value,
      s.total_mtm,
      s.total_max_payout,
      s.available_liquidity,
      s.plp_total_supply,
      s.plp_share_price,
      s.utilization,
      s.max_payout_utilization,
      s.net_deposits,
      s.total_supplied,
      s.total_withdrawn,
    ];
    appendFileSync(CSV_FILE, row.join(',') + '\n');

    const shortTime = now.toISOString().slice(11, 19);
    console.log(
      `[${shortTime}] PLP=${(+s.plp_share_price).toFixed(7)}  ` +
      `value=$${(s.vault_value / 1e6).toFixed(2)}  ` +
      `util=${(+s.utilization * 100).toFixed(3)}%`,
    );
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : err}`);
  }

  await sleep(POLL_INTERVAL_MS);
}