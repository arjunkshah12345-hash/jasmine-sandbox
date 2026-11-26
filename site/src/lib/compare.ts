import { LB, metric, jasmineRow, fmt, type Metric } from "@/lib/jasmine-data";
import { RATES, STD, stdHour, usd } from "@/lib/pricing";

/**
 * Head-to-head pages (/compare/<slug>). Every claim about another provider comes from a named source:
 * benchmarks from aisandboxbench.com's published results (LB), features from General Intelligence Company's
 * provider comparison (Nov 2026), list prices from each provider's pricing page (checked 2026-11-23).
 * Where we don't have a sourced fact, the page says nothing rather than guess.
 */
export type Feature = "yes" | "no" | "limited";
export const FEATURE_LABELS = {
  memSnap: "Memory snapshots (pause with processes intact)",
  diskFork: "Disk snapshot forks",
  s3: "S3 filesystem / bucket mounts",
  browser: "Browser support",
  ipv6: "Outbound IPv6",
} as const;
export type FeatureKey = keyof typeof FEATURE_LABELS;

export const JASMINE_FEATURES: Record<FeatureKey, Feature> = { memSnap: "yes", diskFork: "yes", s3: "yes", browser: "yes", ipv6: "yes" };
export const FEATURE_SOURCE = "General Intelligence Company's sandbox provider comparison, November 2026";

export type Competitor = {
  slug: string;
  name: string;
  /** Provider id in the aisandboxbench results. */
  lb: string;
  features?: Record<FeatureKey, Feature>;
  /** Hourly list price for 4 vCPU / 8 GiB, if we checked it. */
  price?: { hour: number; note?: string; source: string };
};

export const COMPETITORS: Competitor[] = [
  {
    slug: "e2b",
    name: "E2B",
    lb: "e2b",
    features: { memSnap: "yes", diskFork: "yes", s3: "yes", browser: "yes", ipv6: "limited" },
    price: { hour: 0.331, source: "e2b.dev/docs/pricing" },
  },
  {
    slug: "modal",
    name: "Modal",
    lb: "modal",
    features: { memSnap: "yes", diskFork: "yes", s3: "yes", browser: "yes", ipv6: "no" },
  },
  {
    slug: "daytona",
    name: "Daytona",
    lb: "daytona",
    price: { hour: 0.331, source: "daytona.io/pricing" },
  },
  {
    slug: "vercel-sandbox",
    name: "Vercel Sandbox",
    lb: "vercel",
    features: { memSnap: "no", diskFork: "yes", s3: "yes", browser: "yes", ipv6: "limited" },
  },
  {
    slug: "boat",
    name: "Boat",
    lb: "boat",
    features: { memSnap: "no", diskFork: "yes", s3: "yes", browser: "yes", ipv6: "yes" },
    price: { hour: 0.036, note: "plus a $20/month minimum", source: "docs.boat.dev/pricing" },
  },
];

export const competitor = (slug: string) => COMPETITORS.find((c) => c.slug === slug);
export const JASMINE_HOUR = stdHour();
export const STD_LABEL = `${STD.vcpus} vCPU · ${STD.gib} GiB`;

export type Pair = { m: Metric; a: number; b: number; jasmineAhead: boolean; ratio: number };

/** Every metric both Jasmine and the competitor were measured on, with who's ahead. */
export function pairs(c: Competitor): Pair[] {
  const out: Pair[] = [];
  for (const m of LB.metrics) {
    const a = jasmineRow(m)?.median;
    const b = m.rows.find((r) => r.provider === c.lb && r.status === "measured")?.median;
    if (a == null || b == null) continue;
    const jasmineAhead = m.better === "lower" ? a < b : a > b;
    const ratio = m.better === "lower" ? b / a : a / b;
    out.push({ m, a, b, jasmineAhead, ratio });
  }
  return out;
}

/** "4.0× faster" / "2.1× slower" in the metric's direction. */
export function versus(p: Pair) {
  const r = p.jasmineAhead ? p.ratio : 1 / p.ratio;
  if (r < 1.05) return "about the same";
  const word = p.m.better === "lower" ? (p.jasmineAhead ? "faster" : "slower") : p.jasmineAhead ? "higher" : "lower";
  return `${r.toFixed(r >= 10 ? 0 : 1)}× ${word}`;
}

/** Questions people search for, answered from the data (also emitted as FAQPage structured data). */
export function compareFaq(c: Competitor): { q: string; a: string }[] {
  const ps = pairs(c);
  const ahead = ps.filter((p) => p.jasmineAhead);
  const behind = ps.filter((p) => !p.jasmineAhead).sort((x, y) => x.ratio - y.ratio);
  const cold = ps.find((p) => p.m.id === "cold");
  const cmd = ps.find((p) => p.m.id === "command");
  const f: { q: string; a: string }[] = [];
  f.push({
    q: `Is Jasmine faster than ${c.name}?`,
    a: `On most of what an agent waits for, yes. ${cold ? `From asking for a sandbox to running its first command, Jasmine's median is ${fmt(cold.a, "s")} and ${c.name}'s is ${fmt(cold.b, "s")}. ` : ""}${cmd ? `Running a command takes ${fmt(cmd.a, "s")} vs ${fmt(cmd.b, "s")}. ` : ""}Across the ${ps.length} benchmarks both were measured on, Jasmine is ahead on ${ahead.length}.${behind.length ? ` ${c.name} is ahead on ${behind.map((p) => p.m.label.toLowerCase()).join(", ")}.` : ""}`,
  });
  if (c.price) {
    const x = c.price.hour / JASMINE_HOUR;
    f.push({
      q: `Is Jasmine cheaper than ${c.name}?`,
      a: `For a ${STD_LABEL} sandbox, Jasmine Cloud is ${usd(JASMINE_HOUR, 3)} an hour and ${c.name} lists ${usd(c.price.hour, 3)}${c.price.note ? ` ${c.price.note}` : ""} (${c.price.source}, checked Nov 23, 2026)${x >= 1.5 ? `, about ${Math.round(x)}× more` : ""}. Jasmine bills per second from prepaid credit with no minimum, gives ${usd(RATES.trialCredit, 0)} free, and is free to self-host.`,
    });
  }
  f.push({
    q: `Is Jasmine an alternative to ${c.name}?`,
    a: `Yes. Both give AI agents isolated sandboxes to run code in, over an SDK or HTTP API. Jasmine's engine is open source (Apache-2.0), so you can use the hosted Jasmine Cloud or run the same thing on your own Linux machine. Each sandbox is a Firecracker microVM with its own kernel, restored from a memory snapshot instead of booted.`,
  });
  if (c.features) {
    const has = (k: FeatureKey) => ({ yes: "yes", no: "no", limited: "limited or unverified" })[c.features![k]];
    f.push({
      q: `Does Jasmine support memory snapshots, a browser, S3 and IPv6 like ${c.name}?`,
      a: `Jasmine supports all five features in that report: memory snapshots, disk snapshot forks, S3 bucket mounts, a headless browser and outbound IPv6. For ${c.name}, the report lists memory snapshots: ${has("memSnap")}, disk forks: ${has("diskFork")}, S3: ${has("s3")}, browser: ${has("browser")}, IPv6: ${has("ipv6")} (${FEATURE_SOURCE}).`,
    });
  }
  f.push({
    q: "How were these numbers measured?",
    a: `With aisandboxbench's own open-source harness (opencoredev/sandbox-sdk) and its published flags, on the same-machine track (4 vCPU / 8 GB), compared to its published results. Jasmine's numbers are self-run on a GitHub Actions runner with nested virtualization, not an aisandboxbench.com listing, and the client location differs. Raw data is in the [repo](https://github.com/arjunkshah12345-hash/jasmine-sandbox/tree/master/results).`,
  });
  return f;
}

export const coldOf = (id: string) => metric("cold").rows.find((r) => r.provider === id)?.median ?? null;
