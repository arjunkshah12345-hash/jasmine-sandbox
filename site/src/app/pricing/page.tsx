import type { Metadata } from "next";
import { Nav, Footer } from "@/components/site2/rest";
import { Heading } from "@/components/site2/bits";
import { Plans, Calculator, PricingFaq } from "./parts";
import { JsonLd, faqLd } from "@/components/seo/json-ld";
import { PRICING_FAQ } from "@/lib/pricing-faq";

export const metadata: Metadata = {
  title: "Pricing: sandboxes for AI agents from $0.030/hour · Jasmine",
  description: "Sandboxes for AI agents from $0.030 an hour for 4 vCPU / 8 GiB, billed per second from prepaid credit, $2 free. Free and open source to self-host.",
  alternates: { canonical: "/pricing/" },
};

export default function Pricing() {
  return (
    <>
      <JsonLd data={faqLd(PRICING_FAQ.map(([q, a]) => ({ q, a })))} />
      <Nav />
      <main>
        <section className="mx-auto max-w-6xl px-6 pb-12 pt-20 text-center">
          <Heading center kicker="Pricing" title={<>Free to own. Per second to rent.</>}>
            The engine is Apache-2.0 and the same everywhere. Run it on your own machines for nothing, or let us run it.
          </Heading>
        </section>
        <Plans />
        <Calculator />
        <PricingFaq />
      </main>
      <Footer />
    </>
  );
}
