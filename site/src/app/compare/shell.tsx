import type { ReactNode } from "react";
import { Nav, Footer } from "@/components/site2/rest";

/** Shared frame for compare and guide pages: site nav, a readable column, footer. */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      <Nav />
      <main>
        <article className="mx-auto max-w-3xl px-6 pb-20 pt-16">{children}</article>
      </main>
      <Footer />
    </>
  );
}

export function Crumbs({ trail }: { trail: [string, string][] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-zinc-500">
      {trail.map(([name, href], i) => (
        <span key={href}>
          {i > 0 && <span className="px-2 text-zinc-700">/</span>}
          {i < trail.length - 1 ? <a href={href} className="hover:text-white">{name}</a> : <span className="text-zinc-400">{name}</span>}
        </span>
      ))}
    </nav>
  );
}

export function PageTitle({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  return (
    <header className="mt-8">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--leaf)]">{kicker}</p>
      <h1 className="mt-3 text-[clamp(2rem,4.6vw,3.2rem)] font-semibold leading-[1.05] tracking-[-0.04em] text-white">{title}</h1>
      {children && <p className="mt-5 text-xl leading-relaxed text-zinc-400">{children}</p>}
    </header>
  );
}

export function CtaBox() {
  return (
    <div className="mt-16 rounded-2xl border border-[var(--leaf)]/30 bg-[var(--leaf)]/[0.04] p-7">
      <p className="text-lg font-medium text-white">Try it in a minute</p>
      <p className="mt-2 text-zinc-400">Jasmine Cloud gives you $2 free with no card, or self-host it with one command.</p>
      <div className="mt-5 flex flex-wrap gap-3 text-sm">
        <a href="/login?mode=signup&next=/dashboard" className="rounded-lg bg-[var(--leaf)] px-4 py-2 font-medium text-black">Get an API key</a>
        <a href="/docs/self-hosting" className="rounded-lg border border-white/15 px-4 py-2 text-white hover:border-white/30">Self-host it</a>
      </div>
    </div>
  );
}
