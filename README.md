# Floe

> **The verifiable, options-native vault layer for Sui.**
> Deposit once; Floe routes capital across DeepBook Predict, Cetus, and its own money market — and every figure it shows you (NAV, yield, collateral value, volatility) is **signed inside an AWS Nitro enclave and verified on-chain**. No oracle to trust. No curator to take on faith. Borrow, lend, and value against proof.

Built for **Sui Overflow 2026 — DeepBook track**. Live on Sui **testnet**.

---

## Table of contents

- [What is Floe](#what-is-floe)
- [The moat: Verifiable Valuation](#the-moat-verifiable-valuation)
- [System architecture](#system-architecture)
- [Monorepo layout](#monorepo-layout)
- [Deployed addresses (testnet)](#deployed-addresses-testnet)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Running the web app](#running-the-web-app)
- [The enclave (attestation)](#the-enclave-attestation)
- [SDK quick start](#sdk-quick-start)
- [Security model](#security-model)
- [License](#license)

---

## What is Floe

Most DeFi vaults ask you to trust two things you can't verify: the **price oracle** that values their holdings, and the **curator** who reports performance. Floe removes both.

A Floe vault is a non-custodial, cap-gated structured-product vault. Users deposit a quote asset (testnet **dUSDC**) and receive `SHARE` tokens. The vault's operator can deploy idle reserve into yield venues:

- **DeepBook Predict** — PLP (Predict Liquidity Provider) base yield, the flagship venue and the source of Floe's volatility oracle.
- **Cetus** — CLMM liquidity.
- **Floe Lend** — an attested-collateral money market where vault `SHARE` is itself productive collateral.

What makes Floe different is that the vault's **Net Asset Value is not asserted — it is proven**. NAV (and its lower bound, share supply, and % certainty) is computed inside a hardware enclave, signed, and pushed on-chain, where every consumer re-verifies the signature before trusting the number.

### What you can do today (testnet)

| Flow | What happens |
|---|---|
| **Earn** | Browse the vault directory, deposit dUSDC, mint `SHARE`, watch your position track the attested NAV. |
| **Withdraw** | Redeem `SHARE` — paid at full NAV when fresh, at the proven floor when attestation is stale. Never overpaid, never blocked. |
| **Deploy** | If you hold a vault's `ExecCap`, put idle reserve to work as DeepBook Predict liquidity — an explicit, signed action; the vault never moves funds on its own. |
| **Borrow** | Lock `SHARE` as collateral and borrow dUSDC against the **enclave-attested NAV floor**, verified on-chain at borrow time. Then repay to unlock. |
| **Vol** | A live, on-chain implied-volatility surface (3D) reconstructed from DeepBook Predict's SVI oracle. |
| **Verify** | Click any NAV → its on-chain proof: the enclave signature, the PCR-measured build, the verifying object. |

---

## The moat: Verifiable Valuation

Floe's core primitive is a single, reusable pattern: **a value is only trusted on-chain if it carries a signature from a known, hardware-attested enclave.**

```
  AWS Nitro enclave (PCR-measured build, Ed25519 key)
        │  computes  NAV │ implied vol │ collateral value
        │  signs (intent-tagged BCS payload)
        ▼
  Sui contracts re-verify the signature on-chain before trusting the number
        │
        ├── floe::update_nav_attested      → vault NAV floor (deposits/withdrawals)
        ├── floe_vol_index::update_*        → implied-volatility index
        └── floe_lend::lock_and_borrow_*    → collateral valuation (money market)
```

Three independent consumers — **vault NAV, the volatility index, and the lending market** — all verify against the same enclave root of trust. That is the moat: the valuation cannot be forged, inflated, or staled past its freshness window, and the proof is public.

Two verification transports exist:

1. **PCR-anchored** — the contract verifies a signature against an on-chain `Enclave<FLOE_NAV>` object whose public key was registered with a Nitro attestation document proving the build's PCR0.
2. **Vault-read (browser-friendly)** — the vault already stores its latest attested NAV, kept fresh by a NAV heartbeat. `lock_and_borrow_from_vault` reads that floor straight off the vault and asserts `is_price_fresh` — so a browser can borrow against hardware-attested collateral with just an RPC read and the user's wallet, no enclave round-trip.

---

## System architecture

```
┌───────────────────────────────────────────────────────────────────────┐
│  packages/web   Next.js 16 · React 19 · dapp-kit · Enoki zkLogin        │
│  Earn · Borrow · Deploy · Vol surface (Three.js) · Verify · Portfolio   │
└───────────────┬───────────────────────────────────────────────────────┘
                │ reads + verifies on-chain · signs txs (wallet / sponsored gas)
┌───────────────▼───────────────────────────────────────────────────────┐
│  packages/sdk   @floe/sdk (TypeScript)                                  │
│  FloeVault · FloeLend · Vol · Attestation · Registry · Treasury · Yield │
└───────────────┬───────────────────────────────────────────────────────┘
                │ Sui RPC
┌───────────────▼───────────────────────────────────────────────────────┐
│  Move contracts (Sui testnet)                                          │
│  floe (vault factory/registry/treasury) · floe_nav (Verifiable         │
│  Valuation) · floe_lend (money market) · floe_vol_index (IV oracle)    │
└───────────────▲───────────────────────────────────────────────────────┘
                │ pushes signed NAV / vol / collateral values
┌───────────────┴───────────────────────────────────────────────────────┐
│  nautilus-template   AWS Nitro enclave (Nautilus) — `floe-nav` app     │
│  signs intent-tagged payloads · keeper heartbeat keeps NAV fresh       │
└───────────────────────────────────────────────────────────────────────┘
```

The browser **never talks to the enclave**. The keeper signs inside the enclave and pushes attested values on-chain; the frontend reads and re-verifies them from chain. So the enclave needs no public endpoint, and a deployed frontend (e.g. Vercel) only needs Sui RPC + a wallet.

---

## Monorepo layout

pnpm workspace (`packages/*`).

| Path | What it is |
|---|---|
| `packages/web` | Next.js frontend (the app you deploy to Vercel). |
| `packages/sdk` | `@floe/sdk` — TypeScript SDK, the single source of truth for addresses and tx builders. Browser + Node entry points. |
| `packages/move` | The core `floe` Move package (vault factory, registry, treasury, shares, NAV attestation). |
| `packages/floe_nav` | The `floe_nav` Verifiable Valuation primitive (NAV / vol / collateral intents). |
| `packages/floe_lend_v2` | `floe_lend` — the attested-collateral money market (current, PCR-anchored). |
| `packages/floe_vol` | `floe_vol_index` — on-chain implied-volatility index from the Predict SVI oracle. |
| `packages/enclave` | Move-side enclave registry / config (Nautilus integration). |
| `packages/floe-share-ref` | Reference `SHARE` coin template published per vault. |
| `nautilus-template` | The AWS Nitro enclave (Nautilus) — Rust server, `floe-nav` app, build + boot scripts. |
| `scripts/` | Operational scripts (`.env`, attestation restore). |
| `packages/sdk/scripts/` | Attestation + keeper scripts: `attest-all.ts`, `heartbeat.ts`, `seed-vaults.ts`, `boot/`. |

---

## Deployed addresses (testnet)

Single source of truth: [`packages/sdk/src/constants.ts`](./packages/sdk/src/constants.ts). Highlights:

| Component | Object / package |
|---|---|
| Core vault package (`floe`) | `0xc9810eb191cfd05a6d99b98476650efbfd4e2c79b53ee87c87e2abc512083f5a` |
| Vault registry | `0x3462badecc7b4274b222f3b2bf0f0ddab572c294336ec8e7c7d62f42bf1a2f45` |
| Treasury | `0x756dbb6350b61e838afcb81fd1c53975af7b51756f6cc0f6d1981b7df8b2639e` |
| Verifiable Valuation (`floe_nav`) | `0x07677cefab304e5d27d8e2dc4aed20a6ef0f9b8bbadf25de67f61a574a658d7a` |
| `Enclave<FLOE_NAV>` object | `0x4f8be2764a4753786e9e71c15d2c04d55c2bc7fdb43c67276d0b4ae5a1853e71` |
| Floe Lend (`floe_lend` V2) | `0xf6369fc6efee055518be693cf8d3e084ca5a21a9f7a2f21ab855514cb95d7686` |
| Volatility index (`floe_vol_index`) | `0xb94fb487c4e3068869c0f1d2b7df013aba7d15fcbabbe0834d966bc546ae2c10` |
| DeepBook Predict package | `0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138` |
| Quote asset (dUSDC) | `0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC` |

> dUSDC is a third-party DeepBook testnet coin — Floe does not mint it. Get testnet **SUI** for gas from [faucet.sui.io](https://faucet.sui.io); zkLogin users get sponsored gas.

---

## Tech stack

- **Sui L1 · Move** — vault, valuation, lending, and vol-index contracts.
- **DeepBook** — Predict (PLP + SVI vol oracle), the flagship venue.
- **Cetus** — CLMM liquidity venue.
- **AWS Nitro Enclaves / Nautilus** — hardware-attested signing of NAV, vol, and collateral values.
- **Seal** — threshold key servers (open mode) for encrypted blobs.
- **Walrus** — snapshot/track-record storage; optional static site mirror.
- **TypeScript SDK** — `@mysten/sui` 2.17, `@mysten/seal`.
- **Frontend** — Next.js 16, React 19, `@mysten/dapp-kit`, `@mysten/enoki` (zkLogin + sponsored gas), Three.js / react-three-fiber (vol surface), TanStack Query.

---

## Getting started

### Prerequisites

- **Node.js ≥ 20** (developed on 22) and **pnpm 11** (`corepack enable`).
- A Sui wallet (e.g. Sui Wallet / Slush) on **testnet**, with testnet SUI for gas.
- (Optional, for contract work) the **Sui CLI**.
- (Optional, for the enclave) a Nitro-capable EC2 instance — see [`packages/sdk/scripts/boot/README.md`](./packages/sdk/scripts/boot/README.md).

### Install

```bash
git clone https://github.com/Sonayonn/Floe.git
cd Floe
pnpm install
```

### Type-check the SDK + run Move tests

```bash
pnpm --filter @floe/sdk build      # tsc --noEmit
cd packages/move && sui move test  # contract unit tests
```

---

## Running the web app

```bash
cd packages/web
pnpm dev                           # http://localhost:3000
```

### Environment variables (`packages/web/.env.local`)

All are **optional** — the app degrades gracefully without them (wallet-only login, user-paid gas). Set them to unlock zkLogin + sponsored gas.

| Variable | Scope | Purpose |
|---|---|---|
| `NEXT_PUBLIC_ENOKI_API_KEY` | public | Enoki **public** key — enables "Sign in with Google" (zkLogin). Hidden when unset. |
| `ENOKI_PRIVATE_KEY` | **server-only** | Enoki **private** key — sponsors gas via `/api/enoki/*`. Unset ⇒ users pay their own gas. |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | public | Google OAuth 2.0 web client id (paste the same id into the Enoki portal). |
| `FLOE_ENCLAVE_URL` | server-only | Enclave endpoint for the borrow proxy's health check. Optional; the demo borrow path is vault-read and does not require it. |

> Never prefix a secret with `NEXT_PUBLIC_` — that ships it to the browser. `ENOKI_PRIVATE_KEY` and `FLOE_ENCLAVE_URL` are intentionally server-only.

---

## The enclave (attestation)

The `floe-nav` Nautilus enclave signs NAV / vol / collateral values; a keeper pushes them on-chain and a heartbeat keeps PLP-holding vaults fresh within a 600s window.

- **Build & run:** `cd nautilus-template && make ENCLAVE_APP=floe-nav` (prints PCR0), then launch on a Nitro-capable EC2 instance.
- **Attest from your machine:** with the enclave reachable, `scripts/restore-attestation.sh http://<ip>:3000` re-registers the enclave key on every vault, pushes fresh NAV, and starts the heartbeat.
- **Full runbook:** [`packages/sdk/scripts/boot/README.md`](./packages/sdk/scripts/boot/README.md).

> The signing key can be made **stable across reboots** via a KMS-sealed seed (no on-chain churn), or run **ephemeral** for a manually-attested demo (`enclave-up-ephemeral.sh` + re-run `attest-all.ts` per boot).

---

## SDK quick start

```ts
import { FloeClient, FloeVault, FLOE_ADDRESSES } from "@floe/sdk";

const floe = new FloeClient({ network: "testnet" });

// Read a vault's attested state (NAV floor, share supply, freshness, % certain)
const vault = await FloeVault.read(floe, FLOE_ADDRESSES.testnet.refVault);
console.log(vault.navLowerBound, vault.navFresh);

// Build a deposit transaction (sign + execute with your wallet of choice)
const tx = FloeVault.buildDepositTx({
  vaultId: vault.vaultId,
  qType: FLOE_ADDRESSES.testnet.refVaultQType,
  sType: FLOE_ADDRESSES.testnet.refVaultSType,
  sender: myAddress,
  paymentCoinId,
  amount: 1_000_000n, // 1.0 dUSDC @ 6dp
});
```

The SDK exposes browser-safe builders via `@floe/sdk/browser` and Node helpers via `@floe/sdk/node`.

---

## Security model

- **Non-custodial & cap-gated.** Vault funds move only via explicit, cap-signed actions (`OwnerCap` / `ExecCap`); the contract never deploys capital on its own.
- **Attested, un-inflatable valuations.** NAV, collateral value, and vol all carry an enclave signature re-verified on-chain. Collateral can never be over-valued; deposits pause (rather than mint against a stale NAV) when attestation is not fresh — withdrawals still pay the proven floor.
- **Freshness circuit-breaker.** `floe::deposit` aborts on a stale/unsafe NAV; `floe_lend` refuses to lend against a stale floor. A heartbeat keeps live vaults fresh.
- **Secrets stay server-side.** Enoki private key and enclave URL are server-only; the enclave's signing key never leaves the enclave.

---

## License

MIT — see [`LICENSE`](./LICENSE).
