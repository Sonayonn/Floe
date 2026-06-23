/**
 * Precompiled per-vault SHARE coin module (coin_registry OTW), for fully in-app
 * (browser-signed) vault deploy — no Sui CLI / server step required.
 *
 * Each publish of this IDENTICAL bytecode yields a fresh package address on chain,
 * hence a UNIQUE `<pkg>::share::SHARE` coin type, so two vaults never collide. The
 * coin's own metadata is the generic "FLOE-S" / "Floe Vault Share"; per-vault
 * identity (name, symbol, curator) lives on the Vault object + the on-chain
 * directory, which is what the UI reads — never this coin's metadata.
 *
 * The Node path (share/publish.ts) still compiles a per-vault module with custom
 * metadata via the Sui CLI; this constant is purely the browser-publishable variant.
 *
 * Rebuild (must stay byte-for-byte reproducible — edition 2024, Sui rev `testnet`):
 *   module floe_share::share with sui::coin_registry::new_currency_with_otw(
 *     otw, 6, b"FLOE-S", b"Floe Vault Share", b"Floe vault share token", b"", ctx)
 *   sui move build --dump-bytecode-as-base64
 */
export const SHARE_MODULE = {
  /** base64-encoded compiled module(s) for tx.publish({ modules }). */
  modules: [
    'oRzrCwcAAAUKAQAMAgweAyohBEsIBVNaB60BwwEI8AJgBtADPAqMBAUMkQQ6AA4BDwIGAgcCEAIRAAICAAEDBwACBAwBAAEDAAABAAEDAQwBAAEFBQIAAAoAAQABEgMEAAMJCAkBAAMLBgcBAgQMDQEBDAUNCgsAAwUCBQQMBA4CCAAHCAUAAgsEAQgACwIBCAABCgIBCAEBCAAHCQACCAEIAQgBCAEHCAUCCwMBCQALAgEJAAILAwEJAAcIBQELBAEJAAEGCAUBBQELAgEIAAIJAAUBCwQBCAATQ3VycmVuY3lJbml0aWFsaXplcgtNZXRhZGF0YUNhcAVTSEFSRQZTdHJpbmcLVHJlYXN1cnlDYXAJVHhDb250ZXh0BGNvaW4NY29pbl9yZWdpc3RyeQtkdW1teV9maWVsZAhmaW5hbGl6ZQRpbml0FW5ld19jdXJyZW5jeV93aXRoX290dw9wdWJsaWNfdHJhbnNmZXIGc2VuZGVyBXNoYXJlBnN0cmluZwh0cmFuc2Zlcgp0eF9jb250ZXh0BHV0ZjgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIKAgcGRkxPRS1TCgIREEZsb2UgVmF1bHQgU2hhcmUKAhcWRmxvZSB2YXVsdCBzaGFyZSB0b2tlbgoCAQAAAgEIAQAAAAACGwsAMQYHABEBBwERAQcCEQEHAxEBCgE4AAwDCgE4AQwCCwMKAS4RBTgCCwILAS4RBTgDAgAA',
  ],
  /** Framework package dependencies the published module links against (MoveStdlib, Sui). */
  dependencies: [
    '0x0000000000000000000000000000000000000000000000000000000000000001',
    '0x0000000000000000000000000000000000000000000000000000000000000002',
  ],
} as const;
