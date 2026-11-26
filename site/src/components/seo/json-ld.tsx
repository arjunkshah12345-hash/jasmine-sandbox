/** Structured data for search engines and AI answers (schema.org JSON-LD). */
export const SITE = "https://tryjasmine.dev";
/** The site is exported with trailing slashes; canonical URLs must match what is served. */
export const url = (path: string) => SITE + (path.endsWith("/") ? path : `${path}/`);

export function JsonLd({ data }: { data: object | object[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

export const faqLd = (items: { q: string; a: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: items.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: stripMd(a) } })),
});

export const breadcrumbLd = (trail: [string, string][]) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: trail.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: url(path) })),
});

export const articleLd = (o: { title: string; description: string; path: string; updated: string }) => ({
  "@context": "https://schema.org",
  "@type": "TechArticle",
  headline: o.title,
  description: o.description,
  url: url(o.path),
  dateModified: o.updated,
  author: { "@type": "Organization", name: "Jasmine", url: SITE },
  publisher: { "@type": "Organization", name: "Jasmine", url: SITE, logo: { "@type": "ImageObject", url: `${SITE}/og.jpg` } },
});

/** Plain text for JSON-LD from our tiny inline markdown (`code`, [text](href), **bold**). */
export const stripMd = (s: string) => s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1");
