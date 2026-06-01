/** Floe canonical on-chain addresses (testnet v3.2). */
export const FLOE_ADDRESSES = {
  testnet: {
    package:       '0xe88fc982a8e50694fbf4870033be73c6f60c3595a424069d29ff77483848ac4c',
    module:        'floe',
    registry:      '0x3462badecc7b4274b222f3b2bf0f0ddab572c294336ec8e7c7d62f42bf1a2f45',
    treasury:      '0x756dbb6350b61e838afcb81fd1c53975af7b51756f6cc0f6d1981b7df8b2639e',
    agentRegistry: '0xabf57ae9db406f0c74922e1857da855f00fcb2396ec4ccece9af8af5ffd06ba9',
  },
} as const;

export type FloeNetwork = keyof typeof FLOE_ADDRESSES;

/** Scaling constants — must mirror the contract. */
export const INITIAL_SHARE_PRICE = 1_000_000n;   // 1.0 @ 6dp
export const PLP_PRICE_SCALE = 1_000_000_000n;    // 9dp
export const BPS_DENOM = 10_000n;
