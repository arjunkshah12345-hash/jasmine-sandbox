import type { Metadata } from "next";
import { Nav, Footer } from "@/components/site2/rest";
import { Heading } from "@/components/site2/bits";
import { StatusBoard } from "./board";

export const metadata: Metadata = {
  title: "Status · Jasmine",
  description: "Live uptime and create latency for Jasmine Cloud, measured every 10 minutes through the public API.",
};

export default function Status() {
  return (
    <>
      <Nav />
      <main>
        <section className="mx-auto max-w-4xl px-6 pb-10 pt-20 text-center">
          <Heading center kicker="Status" title={<>Jasmine Cloud, measured in public.</>}>
            Every 10 minutes a GitHub Action creates a sandbox, runs a command and deletes it through the public API, the
            same calls you make. The raw data and the probe are open.
          </Heading>
        </section>
        <StatusBoard />
      </main>
      <Footer />
    </>
  );
}
