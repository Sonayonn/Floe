/** Sui explorer (Suiscan testnet) deep-links — the "click any figure to its
 *  on-chain proof" affordance. Single source so every screen links identically. */
const BASE = "https://suiscan.xyz/testnet";

export const suiObject = (id: string) => `${BASE}/object/${id}`;
export const suiTx = (digest: string) => `${BASE}/tx/${digest}`;
export const suiAccount = (addr: string) => `${BASE}/account/${addr}`;
