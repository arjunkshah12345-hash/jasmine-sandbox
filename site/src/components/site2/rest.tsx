"use client";

import { useState } from "react";
import { GrainGradient } from "@/components/grain-gradient";
import { DitherButton } from "@/components/dithercn/dither-button";
import { LB, FB, metric, jasmineRow, fmt, REPO, INSTALL, CREDITS, img } from "@/lib/jasmine-data";
import { Card, CopyInstall, Heading } from "./bits";
import { useUser } from "@/lib/auth";
import { DitherWordmark } from "./extra";
import { HOME_FAQ } from "@/lib/faq";
import { Md } from "@/components/seo/md";

const jr = (id: string) => jasmineRow(metric(id)).median!;

export function How() {
  const steps = [
    { t: "Build a template once", d: "Any OCI image is unpacked to a journal-less ext4 disk, booted in a microVM, page-cache warmed and snapshotted.", k: "jasmined build" },
    { t: "Restore, don't boot", d: "A create reflinks the disk (copy-on-write, O(1)) and maps the snapshot's memory lazily. No kernel boot, no init.", k: `${fmt(jr("cold"), "s")} to first command` },
    { t: "Run over vsock", d: "A tiny static agent is PID 1. Commands and files travel as raw framed bytes over virtio-vsock, no SSH, no JSON on the hot path.", k: `${FB.metrics.exec_ms.bySystem.jasmine!.median.toFixed(1)} ms per command` },
    { t: "Pause, fork, delete", d: "Pause writes only dirty pages. Snapshots become new templates. Delete kills the VM and recycles its network slot.", k: `${fmt(jr("pause-resume"), "s")} pause + resume` },
  ];
  return (
    <section id="how" className="mx-auto max-w-6xl px-6 py-24">
      <Heading kicker="How it works" title="Snapshots all the way down" />
      <ol className="mt-14 grid gap-4 md:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.t}>
            <Card className="h-full p-6">
              <span className="flex size-8 items-center justify-center rounded-full border border-white/15 font-mono text-sm text-zinc-300">{i + 1}</span>
              <h3 className="mt-5 font-medium text-white">{s.t}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-zinc-400">{s.d}</p>
              <p className="mt-5 font-mono text-[13px] text-[var(--leaf)]">{s.k}</p>
            </Card>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function OpenSource() {
  const losses = LB.metrics.filter((m) => m.jasmineRank && m.jasmineRank > 3);
  return (
    <section className="mx-auto max-w-6xl px-6 py-24">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-8">
          <img src={img("mhnt-jasminum-polyanthum-flowers-and-buds.jpg")} alt="White jasmine flowers among pink buds" className="mb-8 h-48 w-full rounded-xl object-cover opacity-90" loading="lazy" />
          <h3 className="text-2xl font-semibold tracking-tight text-white">Open source, on hardware you own</h3>
          <p className="mt-3 text-zinc-400">
            Apache-2.0. One static binary and a systemd unit on any Linux machine with /dev/kvm, x86_64 or arm64. There is no
            per-sandbox price: you pay for the box.
          </p>
          <ul className="mt-6 grid grid-cols-2 gap-3 text-sm text-zinc-300">
            {["Apache-2.0", "x86_64 + arm64", "32 e2e checks per push", "SHA-256 checksums"].map((x) => (
              <li key={x} className="flex items-center gap-2">
                <span className="text-[var(--leaf)]">✓</span> {x}
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-8">
          <h3 className="text-2xl font-semibold tracking-tight text-white">Where it&apos;s slower, in public</h3>
          <p className="mt-3 text-zinc-400">
            Raw throughput is where a VM pays its tax, and nested virtualization on the benchmark runner makes it larger. These are the
            metrics where Jasmine ranks below third:
          </p>
          <ul className="mt-6 divide-y divide-white/[0.06] text-sm">
            {losses.map((m) => (
              <li key={m.id} className="flex justify-between py-2.5">
                <span className="text-zinc-300">{m.label}</span>
                <span className="tabular-nums text-zinc-500">
                  {m.jasmineRank} of {m.of}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </section>
  );
}


export function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" className="mx-auto grid max-w-6xl gap-12 px-6 py-24 lg:grid-cols-[0.8fr_1.2fr]">
      <Heading kicker="FAQ" title="Questions, answered" />
      <div className="divide-y divide-white/[0.08] border-y border-white/[0.08]">
        {HOME_FAQ.map(({ q, a }, i) => (
          <div key={q}>
            <button
              type="button"
              aria-expanded={open === i}
              onClick={() => setOpen(open === i ? -1 : i)}
              className="flex w-full items-center justify-between gap-6 py-5 text-left text-white"
            >
              <span className="font-medium">{q}</span>
              <span className={`text-xl text-zinc-500 transition ${open === i ? "rotate-45" : ""}`}>+</span>
            </button>
            {/* Always in the page (hidden, not removed) so search engines can read every answer. */}
            <p hidden={open !== i} className="-mt-1 pb-5 leading-relaxed text-zinc-400 [&_a]:text-[var(--leaf)] [&_code]:rounded [&_code]:bg-white/[0.06] [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.9em]">
              <Md>{a}</Md>
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Cta() {
  return (
    <section id="install" className="px-6 pb-24">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl border border-white/10">
        <div className="absolute inset-0 -z-10">
          <GrainGradient
            colors={["#0b0d0a", "#2c5a26", "#a6e86b", "#f0b7cc"]}
            background="#0b0d0a"
            speed={0.4}
            grain={0.5}
            dither={{ enabled: true }}
            className="h-full w-full"
          />
          <div className="absolute inset-0 bg-black/45" />
        </div>
        <div className="px-6 py-20 text-center md:py-28">
          <h2 className="mx-auto max-w-3xl text-[clamp(2.2rem,5vw,4rem)] font-semibold leading-[1.03] tracking-[-0.04em] text-white">
            Give your agent a computer in 100 ms
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-zinc-200/80">One command on a Linux host with KVM. Then any OCI image is a template.</p>
          <div className="mt-8 flex justify-center">
            <CopyInstall command={INSTALL} />
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <DitherButton asChild size="lg" color="var(--leaf)">
              <a href={`${REPO}#quick-start-linux-host-with-kvm`}>Read the quick start</a>
            </DitherButton>
            <DitherButton asChild size="lg" variant="outline" color="ink">
              <a href={REPO}>View on GitHub</a>
            </DitherButton>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  const cols = [
    { h: "Product", l: [["Features", "/#features"], ["SDKs", "/#sdk"], ["Benchmarks", "/#benchmarks"], ["Pricing", "/pricing"], ["Status", "/status"], ["Dashboard", "/dashboard"]] },
    { h: "Learn", l: [["Docs", "/docs"], ["Guides", "/guides"], ["Compare providers", "/compare"], ["Blog", "/blog"], ["Agent setup prompt", "/docs/agents"]] },
    { h: "Open source", l: [["GitHub", REPO], ["Releases", `${REPO}/releases`], ["Contributing", `${REPO}/blob/master/CONTRIBUTING.md`], ["Security", `${REPO}/blob/master/SECURITY.md`]] },
    { h: "Benchmarks", l: [["fairbench", `${REPO}/tree/master/bench/fair`], ["aisandboxbench results", `${REPO}/blob/master/results/aisandboxbench-2026-11-21.md`], ["aisandboxbench.com", "https://aisandboxbench.com"]] },
  ];
  return (
    <footer className="border-t border-white/[0.06]">
      <DitherWordmark />
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 md:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm text-zinc-500">Open-source sandboxes for AI agents. Firecracker microVMs, restored from snapshots.</p>
        </div>
        {cols.map((c) => (
          <div key={c.h}>
            <p className="text-sm font-medium text-white">{c.h}</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {c.l.map(([t, h]) => (
                <li key={t}>
                  <a href={h} className="text-zinc-500 transition hover:text-zinc-200">{t}</a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto max-w-6xl border-t border-white/[0.06] px-6 py-6 text-[12px] leading-relaxed text-zinc-600">
        © 2026 The Jasmine authors · Apache-2.0 · Photo: {CREDITS.filter((c) => c.file.includes("mhnt")).map((c) => (
          <span key={c.file}>
            <a className="underline underline-offset-2" href={c.page}>{c.title}</a> by {c.creator}, <a className="underline underline-offset-2" href={c.licenseUrl}>{c.license}</a>
          </span>
        ))}{" "}
        · Built with gradients.sh, dithercn, dither-kit and asciicn, after the sites of @leodev.
      </div>
    </footer>
  );
}

export function Logo() {
  return (
    <a href="/" className="flex items-center gap-2 text-white">
      <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
        {[0, 72, 144, 216, 288].map((a) => (
          <ellipse key={a} cx="12" cy="6.2" rx="2.6" ry="5.2" fill="currentColor" transform={`rotate(${a} 12 12)`} opacity={0.92} />
        ))}
        <circle cx="12" cy="12" r="1.7" fill="var(--leaf)" />
      </svg>
      <span className="text-[17px] font-semibold tracking-tight">Jasmine</span>
    </a>
  );
}

export function Nav() {
  const user = useUser();
  const links: [string, string][] = [
    ["Features", "/#features"],
    ["Benchmarks", "/#benchmarks"],
    ["Docs", "/docs"],
    ["Blog", "/blog"],
    ["Pricing", "/pricing"],
  ];
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#070807]/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-6">
        <Logo />
        <nav className="hidden items-center gap-7 text-sm text-zinc-400 md:flex">
          {links.map(([t, h]) => (
            <a key={t} className="hover:text-white" href={h}>{t}</a>
          ))}
          <a className="hover:text-white" href={REPO}>GitHub</a>
        </nav>
        <div className="flex items-center gap-4">
          {user ? null : (
            <a href="/login" className="hidden text-sm text-zinc-400 hover:text-white sm:block">Sign in</a>
          )}
          <DitherButton asChild size="sm" color="var(--leaf)">
            <a href={user ? "/dashboard" : "/login?mode=signup"}>{user ? "Dashboard" : "Get started"}</a>
          </DitherButton>
        </div>
      </div>
    </header>
  );
}
