import type { Metadata } from "next";
import { JsonLd, breadcrumbLd } from "@/components/seo/json-ld";
import { GUIDES } from "@/content/guides";
import { Shell, Crumbs, PageTitle } from "../compare/shell";

const title = "Guides: sandboxes for AI agents";
const description = "Practical answers about running AI-generated code safely, giving coding agents a sandbox or a browser, mounting S3, forking environments, microVMs, KVM and pricing.";
export const metadata: Metadata = { title: `${title} · Jasmine`, description, alternates: { canonical: "/guides/" }, openGraph: { title, description, images: ["/og.jpg"] } };

export default function Guides() {
  return (
    <Shell>
      <JsonLd data={breadcrumbLd([["Home", "/"], ["Guides", "/guides"]])} />
      <Crumbs trail={[["Home", "/"], ["Guides", "/guides"]]} />
      <PageTitle kicker="Guides" title="Guides for running AI agents' code">Short, direct answers to the questions people ask before they give an agent a computer.</PageTitle>
      <ul className="mt-10 grid gap-4 sm:grid-cols-2">
        {GUIDES.map((g) => (
          <li key={g.slug}>
            <a href={`/guides/${g.slug}`} className="block h-full rounded-2xl border border-white/[0.08] p-6 transition hover:border-white/20">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--leaf)]">{g.kicker}</p>
              <p className="mt-3 text-lg font-medium leading-snug text-white">{g.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{g.description}</p>
            </a>
          </li>
        ))}
      </ul>
    </Shell>
  );
}
