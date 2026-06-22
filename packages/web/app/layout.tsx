import type { Metadata } from "next";
import { Space_Grotesk, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import "../styles/tokens.css";
import "../styles/base.css";
import "../styles/primitives.css";
import "../styles/shell.css";
import "../styles/auth.css";
import "../styles/screens.css";
import "../styles/landing.css";
import "../styles/docs.css";
import "../styles/vol.css";
import "../styles/states.css";
import { Providers } from "./providers";

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-space-grotesk", display: "swap" });
const hanken = Hanken_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-hanken", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-jetbrains", display: "swap" });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.floe.network";
const DESCRIPTION =
  "The verifiable asset-management layer for Sui. Every NAV is computed in a hardware enclave, signed, and verified on-chain — proven, not asserted. Earn, borrow, and read the live volatility surface.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Floe | Verifiable Asset Management on Sui",
    template: "%s · Floe",
  },
  description: DESCRIPTION,
  applicationName: "Floe",
  keywords: ["Sui", "DeFi", "vaults", "verifiable NAV", "Nautilus", "DeepBook", "volatility", "asset management"],
  authors: [{ name: "Floe" }],
  icons: {
    icon: [
      { url: "/brand/floe-favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: "/brand/floe-mark-color.svg",
  },
  openGraph: {
    type: "website",
    siteName: "Floe",
    title: "Floe | Verifiable Asset Management on Sui",
    description: DESCRIPTION,
    url: SITE_URL,
    images: [{ url: "/brand/floe-lockup-horizontal.svg", width: 1200, height: 630, alt: "Floe" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Floe | Verifiable Asset Management on Sui",
    description: DESCRIPTION,
    images: ["/brand/floe-lockup-horizontal.svg"],
  },
  robots: { index: true, follow: true },
  alternates: { canonical: SITE_URL },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${hanken.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
