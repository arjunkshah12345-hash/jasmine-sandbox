# SEO playbook for tryjasmine.dev

## What's built in
- `sitemap.xml` and `robots.txt` are generated (`src/app/sitemap.ts`, `src/app/robots.ts`). AI crawlers are allowed; `/dashboard/` and `/login/` are not indexed.
- Every page has a canonical URL with the trailing slash the static export serves.
- Structured data (JSON-LD): Organization, WebSite and SoftwareApplication (with prices) on the home page; FAQPage on home, pricing, every compare page and every guide; TechArticle and BreadcrumbList on compare and guide pages (`src/components/seo/json-ld.tsx`).
- `public/llms.txt`: a plain summary and link map for AI answer engines.
- Pages written to answer what people search, before Search Console has data:
  - `/compare` and `/compare/<provider>`: comparison and "best" searches ("jasmine vs e2b", "e2b alternative", "best sandbox for ai agents"). Numbers come from `src/data/leaderboard.json`, so they can't drift from the benchmarks. Losses are shown.
  - `/guides/<slug>`: how-to, definition, troubleshooting and pricing questions (`src/content/guides.ts`). Each heading is a question, answered in its first sentence.
- FAQ answers are always in the HTML (hidden, never removed), so search engines can read them.

## Launch day
1. Verify `tryjasmine.dev` in Google Search Console (DNS TXT record) and in Bing Webmaster Tools (it can import from Search Console).
2. Submit `https://tryjasmine.dev/sitemap.xml` in both.
3. Run the home page, `/pricing/`, `/compare/e2b/` and one guide through Google's Rich Results Test.

## Every two weeks after launch (the Search Console question loop)
In Search Console: Performance > Search results > Add filter > Query > Custom (regex). Try each:

| Finds | Regex |
|---|---|
| Questions | `^(who\|what\|when\|where\|why\|how\|which\|can\|could\|should\|would\|will\|do\|does\|did\|is\|are\|was\|were\|has\|have)\b` |
| Comparisons | `\b(vs\|versus\|compare\|compared\|alternatives?\|competitors?\|instead of\|better than\|difference between\|switch from)\b` |
| Pricing | `\b(prices?\|pricing\|costs?\|fees?\|how much\|per month\|per hour\|free)\b` |
| Best / top | `\b(best\|top\|better\|cheapest\|fastest\|recommended)\b` |
| How-to | `\b(how to\|how do i\|guides?\|tutorials?\|step by step\|getting started)\b` |
| Troubleshooting | `\b(fix\|errors?\|issues?\|not working\|broken\|failed\|unable to)\b` |
| Long queries | `^(?:\S+\s+){3,}\S+$` |
| AI-style prompts | `^(give me\|show me\|help me\|explain\|recommend\|compare\|find me\|tell me)\b` |

For each query with high impressions and few clicks: open the page ranking for it. If the question fits that page, add it as a heading (or to the FAQ data) and answer it in the first sentence underneath. If no page fits, add a guide to `src/content/guides.ts`. Keep the words simple.

Then refresh comparison numbers when `results/` changes (they're read from the data files automatically) and bump `updated` on any guide you edit.
