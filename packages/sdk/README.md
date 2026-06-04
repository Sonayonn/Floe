# @floe/sdk

**The TypeScript SDK for Floe — the verifiable allocation layer for Sui yield.**

Floe is an isolated vault that allocates across Sui's yield venues through one
uniform interface and **proves its NAV with hardware attestation** — so depositors
never trust a reported number. Structured products on DeepBook Predict are the
flagship strategy. This SDK is how you read Floe vaults, deploy your own, add a
venue, and consume the attestation moat.

```bash
pnpm add @floe/sdk @mysten/sui
```

```ts
import { FloeClient } from '@floe/sdk';
const floe = new FloeClient({ network: 'testnet' });
```

---

## Read a vault

```ts
import { FloeVault } from '@floe/sdk';

const v = await FloeVault.getVaultState(floe, vaultId);
v.nav;          // total assets (6dp)
v.sharePrice;   // NAV / supply (6dp)
v.plpHeld;      // DeepBook Predict LP held
v.attested;     // is this vault on the hardware-attested NAV tier?
```

## Browse the directory

```ts
import { Registry } from '@floe/sdk';
const vaults = await Registry.listVaults(floe);   // curator, TVL, venues, strategy
```

## The moat — verifiable NAV (what no other vault has)

Floe NAV (and its vol index) can be **hardware-attested**: a value is signed inside
a registered AWS Nitro enclave, and Floe verifies that signature *on-chain* before
accepting it. The enclave's identity is anchored by reproducible PCR measurements.

```ts
import { Attestation } from '@floe/sdk';

const info = Attestation.enclaveInfo(floe);     // live Enclave id + PCR0 + packages
const live = await Attestation.isEnclaveLive(floe);   // moat health check → true

// verify an enclave-signed NAV on-chain (signature comes from the enclave signer):
await Attestation.verifyNav(floe, {
  nav, plpPrice, vaultId, timestampMs, signatureHex,
});   // resolves on success; throws if the signature doesn't verify on-chain
```

This is structurally impossible on EVM/Solana — only Sui's Nautilus verifies a TEE
attestation natively in a smart contract.

## The Sui vol index — on-chain implied volatility

`Vol.volNow` computes at-the-money implied vol **entirely on-chain** from DeepBook
Predict's Block Scholes SVI oracle. Any protocol can read it synchronously.

```ts
import { Vol } from '@floe/sdk';

const bps = await Vol.volNow(floe);        // live BTC ATM implied vol, basis points
Vol.bpsToPercent(bps);                     // e.g. 51.32
const snap = await Vol.currentVol(floe);   // the last on-chain snapshot
```

## Venues — one interface, many implementations

Every venue implements the same `VenueModule` interface (`decide` / `compose` /
`value`). The allocator vault speaks only that interface — it never knows which
protocol a module wraps. **This is what makes "Floe allocates across venues" a real,
extensible seam.**

```ts
import { DeepBookModule, CetusModule, type VenueModule } from '@floe/sdk';

// the live reference venue (DeepBook Predict, Archetype 3: manager position)
const val = await DeepBookModule.value(floe, vaultId);   // → { venue, valueRaw, parts }

// Cetus CLMM (Archetype 2: NFT position) implements the SAME interface
const cval = await CetusModule.value(floe, vaultId);
```

NAV = idle + Σ `module.value(vaultId)` across every venue the vault holds — and that
sum is what the enclave attests.

## Deploy your own vault (curator flow)

```ts
import { Share, FloeVault } from '@floe/sdk';

// 1. publish a per-vault share coin (coin_registry, 2-step)
const share = Share.publishShareModule({ symbol: 'MYV', name: 'My Vault' });
//    → { shareType: '<pkg>::share::SHARE', ... }

// 2. deploy the vault. deploy() encodes policy + fees for you — pass plain inputs:
const vault = await FloeVault.deploy(floe, {
  asset: '…::dusdc::DUSDC',     // the quote asset
  share,                        // from step 1
  policy: { /* allowed venues, max size, leverage cap, enabled strata, floor */ },
  fees:   { managementBps: 100, performanceBps: 1500 },  // capped 3% / 20% on-chain
});
//    → { vaultId, shareType, ... } — now live in the directory under your name
```

> Fee caps + the enabled strata (`Stratum.PLP | RANGE | HEDGE`) are enforced on-chain.
> `Policy` and `Fees` also expose `encodePolicy` / `encodeFees` if you compose your own PTB.

Your vault appears in the directory under your name, inherits provable NAV by
default, and can source third-party capital.

---

## Build on Floe

- **Add a venue:** implement `VenueModule` (`venue`, `decide`, `compose`, `value`) for
  any Sui yield source. `DeepBookModule` and `CetusModule` are reference implementations.
- **Write a strategy:** decide *where* to allocate; the layer handles custody, NAV,
  attestation, and the directory.
- You inherit the whole engine — on-chain valuation, the vol index, and the Nautilus
  attestation moat — without touching the Move contracts.

## Canonical addresses

All on-chain ids are in `FLOE_ADDRESSES.testnet` (`import { FLOE_ADDRESSES } from '@floe/sdk'`).
Never hardcode — reference these.

## Live tour

```bash
pnpm exec tsx examples/sdk-tour.ts   # exercises every read surface against testnet
```

---

*Floe — where Ember is Sui's Morpho, Floe is Sui's Enzyme-meets-Yearn: the verifiable,
multi-venue allocation layer, with provable NAV none of them offer.*
