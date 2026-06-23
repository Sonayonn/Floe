/** Vaults hidden from the product. The on-chain VaultRegistry is append-only
 *  (no deregister exists), so removal is a read-layer denylist applied everywhere
 *  the registry is surfaced: the Earn directory AND the vault detail route.
 *
 *  0x2e5b19ac… = "Floe SDK Demo Vault" — a throwaway SDK smoke-test, not a product.
 *  0x5b128a6e… = "E2E In-App Test Vault" — proved the in-app deploy pipeline end-to-end. */
export const HIDDEN_VAULTS = new Set<string>([
  "0x2e5b19ac7e7773a274474b91776fa7cea1de10ffc84d087b7e79a061b2a85655",
  "0x5b128a6e53705abd078963ed725eb1abcf50600a80afc0dbcac492fdd7ca7015",
]);

export function isHidden(vaultId: string): boolean {
  return HIDDEN_VAULTS.has(vaultId);
}
