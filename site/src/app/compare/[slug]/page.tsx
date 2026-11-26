import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Prose } from "@/components/docs/prose";
import { JsonLd, faqLd, breadcrumbLd, articleLd } from "@/components/seo/json-ld";
import { Md } from "@/components/seo/md";
import { fmt } from "@/lib/jasmine-data";
import { usd } from "@/lib/pricing";
import { COMPETITORS, competitor, pairs, versus, compareFaq, FEATURE_LABELS, FEATURE_SOURCE, JASMINE_FEATURES, JASMINE_HOUR, STD_LABEL, type FeatureKey } from "@/lib/compare";
import { Shell, Crumbs, PageTitle, CtaBox } from "../shell";

export const dynamicParams = false;
export function generateStaticParams() {
  return COMPETITORS.map((c) => ({ slug: c.slug }));
}

const UPDATED = "2026-11-25";
const mark = { yes: "✓ Yes", no: "✗ No", limited: "! Limited or unverified" } as const;

export async function generateMetadata({ params }: PageProps<"/compare/[slug]">): Promise<Metadata> {
  const c = competitor((await params).slug);
  if (!c) return {};
  const title = `Jasmine vs ${c.name} (2026): speed, price and features`;
  const description = `${c.name} alternative compared on the same benchmark harness: cold start, command latency, snapshots and price for AI agent sandboxes. Open source, self-hostable, ${usd(JASMINE_HOUR, 3)}/hour hosted.`;
  return { title, description, alternates: { canonical: `/compare/${c.slug}/` }, openGraph: { title, description, type: "article", images: ["/og.jpg"] }, twitter: { card: "summary_large_image", title, description, images: ["/og.jpg"] } };
}

export default async function ComparePage({ params }: PageProps<"/compare/[slug]">) {
  const c = competitor((await params).slug);
  if (!c) notFound();
  const ps = pairs(c);
  const ahead = ps.filter((p) => p.jasmineAhead);
  const behind = ps.filter((p) => !p.jasmineAhead);
  const cold = ps.find((p) => p.m.id === "cold");
  const faq = compareFaq(c);
  const path = `/compare/${c.slug}`;
  const title = `Jasmine vs ${c.name}`;
  return (
    <Shell>
      <JsonLd data={[faqLd(faq), breadcrumbLd([["Home", "/"], ["Compare", "/compare"], [title, path]]), articleLd({ title, description: `Jasmine and ${c.name} compared on the same benchmark harness.`, path, updated: UPDATED })]} />
      <Crumbs trail={[["Home", "/"], ["Compare", "/compare"], [title, path]]} />
      <PageTitle kicker="Compare" title={`Jasmine vs ${c.name}: which sandbox is faster for AI agents?`}>
        {cold ? `Jasmine is ready for a first command in ${fmt(cold.a, "s")}; ${c.name} takes ${fmt(cold.b, "s")}. ` : ""}
        On the same benchmark harness, Jasmine is ahead on {ahead.length} of {ps.length} shared measurements{behind.length ? ` and ${c.name} on ${behind.length}` : ""}. Here is every number, including the ones we lose.
      </PageTitle>
      <div className="mt-10">
        <Prose>
          <h2 id="short-answer">The short answer</h2>
          <p>
            Pick <strong>Jasmine</strong> if your agents create many short-lived sandboxes and wait on each command: it restores Firecracker microVMs from
            memory snapshots, so start-up, command round-trips, pause/resume and forks are where it leads. It is open source and runs on your own
            machine too. {behind.length ? <>Pick <strong>{c.name}</strong> if what matters most is where it measured ahead: {behind.map((p) => p.m.label.toLowerCase()).join("; ")}.</> : null}
          </p>

          <h2 id="benchmarks">How do Jasmine and {c.name} compare on speed?</h2>
          <p>Medians on aisandboxbench&apos;s same-machine track (4 vCPU / 8 GB). Bold is the better number.</p>
          <table>
            <thead><tr><th>Measurement</th><th>Jasmine</th><th>{c.name}</th><th>Jasmine is</th></tr></thead>
            <tbody>
              {ps.map((p) => (
                <tr key={p.m.id}>
                  <td>{p.m.label}</td>
                  <td>{p.jasmineAhead ? <strong>{fmt(p.a, p.m.unit)}</strong> : fmt(p.a, p.m.unit)}</td>
                  <td>{!p.jasmineAhead ? <strong>{fmt(p.b, p.m.unit)}</strong> : fmt(p.b, p.m.unit)}</td>
                  <td>{versus(p)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {behind.length > 0 && (
            <>
              <h2 id="where-it-wins">Where is {c.name} faster than Jasmine?</h2>
              <ul>{behind.map((p) => <li key={p.m.id}><strong>{p.m.label}:</strong> {fmt(p.b, p.m.unit)} vs Jasmine&apos;s {fmt(p.a, p.m.unit)}.</li>)}</ul>
              <p>Jasmine&apos;s numbers come from a GitHub runner with nested virtualization, which taxes disk and memory benchmarks the most. Bare metal may narrow those gaps, but we show what we measured.</p>
            </>
          )}

          {c.features && (
            <>
              <h2 id="features">Which features do Jasmine and {c.name} have?</h2>
              <table>
                <thead><tr><th>Feature</th><th>Jasmine</th><th>{c.name}</th></tr></thead>
                <tbody>
                  {(Object.keys(FEATURE_LABELS) as FeatureKey[]).map((k) => (
                    <tr key={k}><td>{FEATURE_LABELS[k]}</td><td>{mark[JASMINE_FEATURES[k]]}</td><td>{mark[c.features![k]]}</td></tr>
                  ))}
                  <tr><td>Open source, self-hostable</td><td>✓ Yes (Apache-2.0)</td><td>See {c.name}&apos;s docs</td></tr>
                </tbody>
              </table>
              <p className="text-sm text-zinc-500">{c.name}&apos;s column: {FEATURE_SOURCE}.</p>
            </>
          )}

          <h2 id="price">How much do Jasmine and {c.name} cost?</h2>
          <p>
            Jasmine Cloud is <strong>{usd(JASMINE_HOUR, 3)} an hour</strong> for {STD_LABEL}, billed per second from prepaid credit: no minimum, no fee per start,
            and a paused sandbox only pays for storage. Self-hosting is free.{" "}
            {c.price ? <>{c.name} lists {usd(c.price.hour, 3)} an hour for the same size{c.price.note ? ` ${c.price.note}` : ""} ({c.price.source}, checked Nov 23, 2026).</> : <>For {c.name}&apos;s current prices, see its pricing page.</>}
          </p>

          <h2 id="faq">Questions people ask</h2>
          {faq.map((f) => (
            <div key={f.q}>
              <h3>{f.q}</h3>
              <p><Md>{f.a}</Md></p>
            </div>
          ))}

          <h2 id="others">Other comparisons</h2>
          <ul>
            {COMPETITORS.filter((o) => o.slug !== c.slug).map((o) => <li key={o.slug}><a href={`/compare/${o.slug}`}>Jasmine vs {o.name}</a></li>)}
            <li><a href="/compare/docker">Jasmine vs Docker, gVisor and Kata (same machine)</a></li>
            <li><a href="/compare">All 14 hosted sandbox providers, side by side</a></li>
          </ul>
        </Prose>
      </div>
      <CtaBox />
    </Shell>
  );
}
