import type { Metadata } from "next";
import { Prose } from "@/components/docs/prose";
import { JsonLd, faqLd, breadcrumbLd } from "@/components/seo/json-ld";
import { Md } from "@/components/seo/md";
import { LB, metric, fmt, headToHead } from "@/lib/jasmine-data";
import { COMPETITORS, JASMINE_HOUR, STD_LABEL } from "@/lib/compare";
import { usd } from "@/lib/pricing";
import { Shell, Crumbs, PageTitle, CtaBox } from "./shell";

const title = "Best sandboxes for AI agents (2026): 14 providers, measured";
const description = "Every major hosted sandbox for AI agents measured on one open benchmark harness: cold start, command latency and agent workloads for E2B, Modal, Daytona, Vercel Sandbox, Beam, Boat and more, next to open-source Jasmine.";
export const metadata: Metadata = { title, description, alternates: { canonical: "/compare/" }, openGraph: { title, description, images: ["/og.jpg"] }, twitter: { card: "summary_large_image", title, description, images: ["/og.jpg"] } };

const val = (id: string, p: string) => metric(id).rows.find((r) => r.provider === p && r.status === "measured")?.median ?? null;

export default function CompareHub() {
  const ids = LB.providers.filter((p) => p.ranked).map((p) => p.id);
  const rows = ids.map((id) => ({ id, name: LB.providers.find((p) => p.id === id)!.name, cold: val("cold", id), cmd: val("command", id), replay: val("tool-replay", id), fork: val("create-from-snapshot", id) }))
    .filter((r) => r.cold != null).sort((a, b) => a.cold! - b.cold!);
  const h2h = headToHead();
  const faq = [
    { q: "What is the fastest sandbox for AI agents?", a: `On aisandboxbench's same-machine track, Jasmine has the fastest median cold start (${fmt(val("cold", "jasmine"), "s")}, next best ${rows[1].name} at ${fmt(rows[1].cold, "s")}) and the fastest command round-trip. It ranks first on ${LB.wins} of ${LB.measured} metrics; Modal leads big bursts, and several providers lead raw disk throughput.` },
    { q: "What is the cheapest sandbox for AI agents?", a: `Self-hosted Jasmine is free on your own hardware. Hosted, Jasmine Cloud is ${usd(JASMINE_HOUR, 3)} an hour for ${STD_LABEL} with no minimum; E2B and Daytona list about $0.33 for the same size and Boat $0.036 plus a $20/month minimum (checked Nov 23, 2026). See [what a sandbox costs](/guides/ai-sandbox-pricing).` },
    { q: "Which AI sandbox is open source?", a: "Jasmine's whole engine is Apache-2.0 and runs on any Linux machine with KVM. You can use the hosted Jasmine Cloud and move to your own servers by changing one environment variable." },
    { q: "How should I choose a sandbox for my agent?", a: "Count what your agent waits on. Coding agents create many short sandboxes and run many small commands, so cold start, command latency and pause/resume matter most. Data jobs care about disk and CPU throughput. Then check isolation (own kernel or shared), network rules, and whether you can self-host." },
  ];
  return (
    <Shell>
      <JsonLd data={[faqLd(faq), breadcrumbLd([["Home", "/"], ["Compare", "/compare"]])]} />
      <Crumbs trail={[["Home", "/"], ["Compare", "/compare"]]} />
      <PageTitle kicker="Compare" title="The best sandboxes for AI agents in 2026, measured">
        Fourteen hosted sandbox providers, one open benchmark harness, the same 4 vCPU / 8 GB machine size. Sorted by how fast an agent gets a sandbox it can use.
      </PageTitle>
      <div className="mt-10">
        <Prose>
          <h2 id="table">Which AI sandbox starts fastest?</h2>
          <table>
            <thead><tr><th>Provider</th><th>Cold start</th><th>Run a command</th><th>Start from snapshot</th><th>Agent tool replay</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.id === "jasmine" ? <strong>Jasmine</strong> : COMPETITORS.find((c) => c.lb === r.id) ? <a href={`/compare/${COMPETITORS.find((c) => c.lb === r.id)!.slug}`}>{r.name}</a> : r.name}</td>
                  <td>{fmt(r.cold, "s")}</td><td>{fmt(r.cmd, "s")}</td><td>{fmt(r.fork, "s")}</td><td>{fmt(r.replay, "s")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-sm text-zinc-500">Medians. Others: aisandboxbench.com published results, run {LB.run.start.slice(0, 10)} to {LB.run.end.slice(0, 10)}. Jasmine: self-run on the same open-source harness and flags, not an aisandboxbench.com listing. Full method and caveats in the <a href="https://github.com/arjunkshah12345-hash/jasmine-sandbox/blob/master/results/aisandboxbench-2026-11-21.md">raw results</a>.</p>

          <h2 id="head-to-head">How many benchmarks does Jasmine win against each provider?</h2>
          <ul>{h2h.map((p) => <li key={p.id}>{COMPETITORS.find((c) => c.lb === p.id) ? <a href={`/compare/${COMPETITORS.find((c) => c.lb === p.id)!.slug}`}>vs {p.name}</a> : <>vs {p.name}</>}: Jasmine ahead on {p.ahead} of {p.shared}</li>)}</ul>

          <h2 id="pages">Head-to-head pages</h2>
          <ul>
            {COMPETITORS.map((c) => <li key={c.slug}><a href={`/compare/${c.slug}`}>Jasmine vs {c.name}</a></li>)}
            <li><a href="/compare/docker">Jasmine vs Docker, gVisor and Kata on one machine</a></li>
          </ul>

          <h2 id="faq">Questions people ask</h2>
          {faq.map((f) => (<div key={f.q}><h3>{f.q}</h3><p><Md>{f.a}</Md></p></div>))}
        </Prose>
      </div>
      <CtaBox />
    </Shell>
  );
}
