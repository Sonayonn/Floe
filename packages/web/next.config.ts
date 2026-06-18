import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16 runs a dependency-status check that invokes the package manager on dev;
  // in this pnpm-workspace it exits non-zero on an ignored optional build. Disable it.
  experimental: {
    // turbo is default; nothing else needed
  },
  // react-three-fiber: three ships untranspiled modern ESM — Next must transpile it.
  transpilePackages: ["three"],
  // skip the package-manager dep check that triggers `pnpm install` on boot
  onDemandEntries: { maxInactiveAge: 60000 },
};

export default nextConfig;
