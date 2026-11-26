import type { MetadataRoute } from "next";
import { SITE } from "@/components/seo/json-ld";

export const dynamic = "force-static";

/** Everyone, including AI crawlers, may read the public site; account pages are off-limits. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/dashboard/", "/login/"] }],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
