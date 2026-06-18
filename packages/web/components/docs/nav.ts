/* Single source of truth for the docs IA — consumed by the page (section order),
   the left sidebar (grouped nav), and the right "on this page" rail. */
export type DocItem = { id: string; label: string };
export type DocGroup = { group: string; items: DocItem[] };

export const DOC_NAV: DocGroup[] = [
  {
    group: "Overview",
    items: [
      { id: "intro", label: "Introduction" },
      { id: "architecture", label: "Architecture" },
      { id: "concepts", label: "Core concepts" },
    ],
  },
  {
    group: "SDK",
    items: [
      { id: "quickstart", label: "Quickstart" },
      { id: "reading", label: "Reading vaults" },
      { id: "attestation", label: "Verifiable NAV" },
      { id: "vol", label: "Volatility index" },
      { id: "venues", label: "Venues" },
      { id: "lend", label: "Floe Lend" },
      { id: "data", label: "Walrus & Seal" },
      { id: "agents", label: "Agents & authority" },
    ],
  },
  {
    group: "Build",
    items: [
      { id: "deploy", label: "Deploy a vault" },
      { id: "hello", label: "hello_vault primer" },
      { id: "api", label: "API reference" },
    ],
  },
  {
    group: "Reference",
    items: [
      { id: "packages", label: "Browser vs Node" },
      { id: "addresses", label: "Addresses & tour" },
    ],
  },
];

export const DOC_IDS: string[] = DOC_NAV.flatMap((g) => g.items.map((i) => i.id));
