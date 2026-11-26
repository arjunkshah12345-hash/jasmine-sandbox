import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Hero } from "@/components/site2/hero";
import { Logos, Stats, Features, Sdk } from "@/components/site2/features";
import { Benchmarks } from "@/components/site2/benchmarks";
import { Nav, How, OpenSource, Faq, Cta, Footer } from "@/components/site2/rest";
import { AgentSetup, Reveal, Ticker } from "@/components/site2/extra";
import { FromBlog } from "@/components/site2/from-blog";
import type { Metadata } from "next";
import { JsonLd, SITE, faqLd } from "@/components/seo/json-ld";
import { HOME_FAQ } from "@/lib/faq";
import { RATES, stdHour } from "@/lib/pricing";
import { REPO } from "@/lib/jasmine-data";

export const metadata: Metadata = { alternates: { canonical: "/" } };

const LD = [
  { "@context": "https://schema.org", "@type": "Organization", name: "Jasmine", url: SITE, logo: `${SITE}/og.jpg`, sameAs: [REPO] },
  { "@context": "https://schema.org", "@type": "WebSite", name: "Jasmine", url: SITE },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Jasmine",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Linux",
    description: "Open-source sandboxes for AI agents: Firecracker microVMs restored from memory snapshots, ready in about 100 ms. Self-hosted or hosted as Jasmine Cloud.",
    url: SITE,
    license: "https://www.apache.org/licenses/LICENSE-2.0",
    codeRepository: REPO,
    offers: [
      { "@type": "Offer", name: "Open source (self-hosted)", price: "0", priceCurrency: "USD" },
      { "@type": "Offer", name: "Jasmine Cloud, 4 vCPU / 8 GiB, per hour", price: stdHour().toFixed(3), priceCurrency: "USD", description: `Billed per second from prepaid credit. $${RATES.trialCredit} free, no card.` },
    ],
  },
  faqLd(HOME_FAQ),
];

export default function Home() {
  const prompt = readFileSync(join(process.cwd(), "public/agent-setup.md"), "utf8");
  return (
    <>
      <JsonLd data={LD} />
      <Nav />
      <main id="top">
        <Hero />
        <Logos />
        <Reveal><Stats /></Reveal>
        <Ticker />
        <Reveal><Features /></Reveal>
        <Reveal><Sdk /></Reveal>
        <Reveal><AgentSetup prompt={prompt} /></Reveal>
        <Benchmarks />
        <Reveal><How /></Reveal>
        <Reveal><OpenSource /></Reveal>
        <Reveal><FromBlog /></Reveal>
        <Faq />
        <Cta />
      </main>
      <Footer />
    </>
  );
}
