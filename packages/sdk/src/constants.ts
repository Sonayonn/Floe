/** Floe canonical on-chain addresses (testnet v3.2). */
export const FLOE_ADDRESSES = {
  testnet: {
    package:       '0x513dcd38a144c3f7fdfbee77fce6b1e3289bed7d93ed71bd619ee107b8231ac2',
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
