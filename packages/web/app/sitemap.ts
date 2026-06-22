import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.floe.network";

// Public, indexable routes. Per-vault detail pages are dynamic/on-chain and intentionally omitted.
const ROUTES: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "/", priority: 1.0, changeFrequency: "weekly" },
  { path: "/earn", priority: 0.9, changeFrequency: "hourly" },
  { path: "/borrow", priority: 0.8, changeFrequency: "hourly" },
  { path: "/vol", priority: 0.8, changeFrequency: "hourly" },
  { path: "/verify", priority: 0.8, changeFrequency: "daily" },
  { path: "/portfolio", priority: 0.6, changeFrequency: "daily" },
  { path: "/deploy", priority: 0.7, changeFrequency: "weekly" },
  { path: "/docs", priority: 0.7, changeFrequency: "weekly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return ROUTES.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
}
