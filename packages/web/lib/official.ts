/** The designated Floe-official curator. Vaults curated by this address carry
 *  the "Floe official" badge; every other vault renders identically (deploy-parity)
 *  but without it. Single source of truth for the whole app. */
export const FLOE_OFFICIAL_CURATOR =
  "0x9a249cb07dbe8bbdf4b880255c72ed103a995bd390a72903b26797f51e366216";

export function isOfficial(curator: string | undefined): boolean {
  return !!curator && curator === FLOE_OFFICIAL_CURATOR;
}
