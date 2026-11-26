import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Prose } from "@/components/docs/prose";
import { JsonLd, faqLd, breadcrumbLd, articleLd } from "@/components/seo/json-ld";
import { Md } from "@/components/seo/md";
import { GUIDES, guide } from "@/content/guides";
import { Shell, Crumbs, PageTitle, CtaBox } from "../../compare/shell";

export const dynamicParams = false;
export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: PageProps<"/guides/[slug]">): Promise<Metadata> {
  const g = guide((await params).slug);
  if (!g) return {};
  return {
    title: `${g.title} · Jasmine`,
    description: g.description,
    alternates: { canonical: `/guides/${g.slug}/` },
    openGraph: { title: g.title, description: g.description, type: "article", images: ["/og.jpg"] },
    twitter: { card: "summary_large_image", title: g.title, description: g.description, images: ["/og.jpg"] },
  };
}

const anchor = (q: string) => q.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export default async function GuidePage({ params }: PageProps<"/guides/[slug]">) {
  const g = guide((await params).slug);
  if (!g) notFound();
  const path = `/guides/${g.slug}`;
  const trail: [string, string][] = [["Home", "/"], ["Guides", "/guides"], [g.title, path]];
  return (
    <Shell>
      <JsonLd data={[articleLd({ title: g.title, description: g.description, path, updated: g.updated }), faqLd(g.sections.map((s) => ({ q: s.q, a: s.a }))), breadcrumbLd(trail)]} />
      <Crumbs trail={trail} />
      <PageTitle kicker={g.kicker} title={g.title}>{g.intro}</PageTitle>
      <nav aria-label="On this page" className="mt-8 rounded-xl border border-white/[0.08] p-5 text-sm">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">On this page</p>
        <ul className="mt-3 space-y-1.5">{g.sections.map((s) => <li key={s.q}><a href={`#${anchor(s.q)}`} className="text-zinc-300 hover:text-white">{s.q}</a></li>)}</ul>
      </nav>
      <div className="mt-4">
        <Prose>
          {g.sections.map((s) => (
            <section key={s.q}>
              <h2 id={anchor(s.q)}>{s.q}</h2>
              <p><Md>{s.a}</Md></p>
              {s.code && <pre className="my-6 overflow-x-auto rounded-xl border border-white/10 bg-black/50 p-5 font-mono text-[13px] leading-relaxed text-zinc-300"><code>{s.code}</code></pre>}
              {s.more?.map((m) => <p key={m}><Md>{m}</Md></p>)}
            </section>
          ))}
          <h2 id="related">Related</h2>
          <ul>
            {g.related.map((r) => guide(r)).filter(Boolean).map((r) => <li key={r!.slug}><a href={`/guides/${r!.slug}`}>{r!.title}</a></li>)}
            <li><a href="/compare">The best sandboxes for AI agents, measured</a></li>
          </ul>
          <p className="text-sm text-zinc-500">Updated {g.updated}.</p>
        </Prose>
      </div>
      <CtaBox />
    </Shell>
  );
}
