import type { MetadataRoute } from "next";
import { POSTS } from "@/content/blog";
import { GUIDES } from "@/content/guides";
import { COMPETITORS } from "@/lib/compare";
import { url } from "@/components/seo/json-ld";

export const dynamic = "force-static";

/** Every public page, at the trailing-slash URL the static export serves. */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date("2026-11-25");
  const page = (path: string, priority: number, changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] = "weekly") => ({ url: url(path), lastModified: now, changeFrequency, priority });
  return [
    page("/", 1, "daily"),
    page("/pricing", 0.9),
    page("/compare", 0.9),
    ...COMPETITORS.map((c) => page(`/compare/${c.slug}`, 0.8)),
    page("/compare/docker", 0.8),
    page("/guides", 0.8),
    ...GUIDES.map((g) => page(`/guides/${g.slug}`, 0.7, "monthly")),
    page("/docs", 0.8),
    ...["agents", "concepts", "sdk", "api", "browser", "storage", "cloud", "self-hosting"].map((d) => page(`/docs/${d}`, 0.7)),
    page("/blog", 0.6),
    ...POSTS.map((p) => ({ ...page(`/blog/${p.slug}`, 0.6, "monthly"), lastModified: new Date(p.date) })),
    page("/status", 0.4, "daily"),
  ];
}
