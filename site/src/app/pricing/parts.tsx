"use client";

import { useMemo, useState } from "react";
import { DitherButton } from "@/components/dithercn/dither-button";
import { Card, Heading } from "@/components/site2/bits";
import { useUser } from "@/lib/auth";
import { REPO } from "@/lib/jasmine-data";
import { RATES, STD, stdHour, usd } from "@/lib/pricing";
import { PRICING_FAQ } from "@/lib/pricing-faq";


export function Plans() {
  const user = useUser();
  const cloudHref = user ? "/dashboard#cloud" : "/login?mode=signup&next=/dashboard";
  const plans = [
    {
      name: "Open source",
      price: "$0",
      per: "forever",
      blurb: "The whole engine on hardware you own. No account, no telemetry.",
      cta: { label: "Self-host it", href: "/docs", outline: true },
      items: ["Every feature: snapshots, pause, fork, previews", "Any Linux box with /dev/kvm", "x86_64 and arm64", "Apache-2.0", "Community support on GitHub"],
    },
    {
      name: "Cloud",
      badge: "Usage-based",
      price: usd(stdHour(), 3),
      per: `per hour for ${STD.vcpus} vCPU · ${STD.gib} GiB`,
      blurb: `${usd(RATES.vcpuHour, 4)} per vCPU-hour plus ${usd(RATES.gibHour, 4)} per GiB-hour, billed per second from prepaid credit that never expires. No minimum, no fee per start. ${usd(RATES.trialCredit, 0)} free to try, no card.`,
      cta: { label: "Start on Cloud", href: cloudHref, outline: false },
      items: ["Nothing to run or patch", "Paused sandboxes keep memory and cost storage only", `Snapshots at ${usd(RATES.storageGibMonth)} per GiB-month`, "Prepaid: you can never owe more than you put in", "Usage and billing in the dashboard"],
      featured: true,
    },
    {
      name: "Enterprise",
      price: "Custom",
      per: "annual",
      blurb: "Jasmine in your own cloud account, or dedicated hosts in ours.",
      cta: { label: "Talk to us", href: cloudHref, outline: true },
      items: ["Bring your own cloud", "Dedicated bare-metal hosts", "SSO and audit logs", "Uptime SLA", "A shared Slack channel"],
    },
  ];
  return (
    <section className="mx-auto grid max-w-6xl gap-4 px-6 md:grid-cols-3">
      {plans.map((p) => (
        <Card key={p.name} className={`flex flex-col p-7 ${p.featured ? "border-[var(--leaf)]/40 bg-[var(--leaf)]/[0.04]" : ""}`}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-white">{p.name}</h2>
            {p.badge && <span className="rounded-full border border-[var(--leaf)]/40 px-2.5 py-0.5 text-xs text-[var(--leaf)]">{p.badge}</span>}
          </div>
          <p className="mt-6 flex items-baseline gap-2">
            <span className="text-4xl font-semibold tracking-[-0.04em] text-white">{p.price}</span>
            <span className="text-sm text-zinc-500">{p.per}</span>
          </p>
          <p className="mt-3 min-h-[3rem] text-sm leading-relaxed text-zinc-400">{p.blurb}</p>
          <DitherButton asChild size="lg" className="mt-6 w-full" color={p.cta.outline ? "ink" : "var(--leaf)"} variant={p.cta.outline ? "outline" : undefined}>
            <a href={p.cta.href}>{p.cta.label}</a>
          </DitherButton>
          <ul className="mt-7 space-y-2.5 text-sm text-zinc-300">
            {p.items.map((x) => (
              <li key={x} className="flex gap-2.5">
                <span className="font-mono text-[var(--leaf)]">+</span>
                {x}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </section>
  );
}

function Slider(props: { label: string; value: number; min: number; max: number; step: number; onChange: (n: number) => void; show: (n: number) => string }) {
  return (
    <label className="block">
      <span className="flex justify-between text-sm">
        <span className="text-zinc-400">{props.label}</span>
        <span className="font-mono tabular-nums text-white">{props.show(props.value)}</span>
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="mt-2 w-full accent-[var(--leaf)]"
      />
    </label>
  );
}

export function Calculator() {
  const [perDay, setPerDay] = useState(500);
  const [minutes, setMinutes] = useState(6);
  const [vcpus, setVcpus] = useState(1);
  const [mem, setMem] = useState(1);

  const { hours, compute, memory, total, bill } = useMemo(() => {
    const hours = (perDay * 30 * minutes) / 60;
    const compute = hours * vcpus * RATES.vcpuHour;
    const memory = hours * mem * RATES.gibHour;
    const total = compute + memory;
    return { hours, compute, memory, total, bill: total };
  }, [perDay, minutes, vcpus, mem]);

  const blocks = 40;
  const filled = Math.min(blocks, Math.round((total / Math.max(total, 1000)) * blocks));

  return (
    <section className="mx-auto max-w-6xl px-6 py-24">
      <Card className="grid gap-10 p-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <Heading kicker="Estimate" title="What would Cloud cost you?" />
          <div className="mt-8 space-y-6">
            <Slider label="Sandboxes per day" value={perDay} min={10} max={20000} step={10} onChange={setPerDay} show={(n) => n.toLocaleString()} />
            <Slider label="Average lifetime" value={minutes} min={1} max={120} step={1} onChange={setMinutes} show={(n) => `${n} min`} />
            <Slider label="vCPUs each" value={vcpus} min={1} max={8} step={1} onChange={setVcpus} show={(n) => `${n}`} />
            <Slider label="Memory each" value={mem} min={0.5} max={16} step={0.5} onChange={setMem} show={(n) => `${n} GiB`} />
          </div>
        </div>
        <div className="flex flex-col justify-between rounded-xl border border-white/10 bg-black/40 p-6 font-mono text-sm">
          <div className="space-y-2 text-zinc-400">
            <Row k="sandbox-hours / month" v={Math.round(hours).toLocaleString()} />
            <Row k={`vCPU @ ${usd(RATES.vcpuHour, 4)}/h`} v={usd(compute)} />
            <Row k={`memory @ ${usd(RATES.gibHour, 4)}/GiB-h`} v={usd(memory)} />
          </div>
          <div className="mt-8">
            <p className="text-zinc-500">estimated monthly bill</p>
            <p className="mt-1 text-4xl font-semibold tracking-tight text-white tabular-nums">{usd(bill)}</p>
            <p className="mt-4 select-none tracking-[-0.05em] text-[var(--leaf)]" aria-hidden>
              {"█".repeat(filled)}
              <span className="text-zinc-800">{"░".repeat(blocks - filled)}</span>
            </p>
            <p className="mt-4 font-sans text-xs leading-relaxed text-zinc-500">
              Assumes sandboxes are deleted when done. Paused sandboxes stop compute billing. Self-hosting costs only your machines.
            </p>
          </div>
        </div>
      </Card>
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <p className="flex justify-between gap-4">
      <span>{k}</span>
      <span className="tabular-nums text-zinc-200">{v}</span>
    </p>
  );
}


export function PricingFaq() {
  return (
    <section className="mx-auto max-w-3xl px-6 pb-24">
      <h2 className="text-2xl font-semibold tracking-tight text-white">Pricing questions</h2>
      <dl className="mt-6 divide-y divide-white/[0.08] border-y border-white/[0.08]">
        {PRICING_FAQ.map(([q, a]) => (
          <div key={q} className="py-5">
            <dt className="font-medium text-white">{q}</dt>
            <dd className="mt-2 leading-relaxed text-zinc-400">{a}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-8 text-sm text-zinc-500">
        Prefer to read the code first? <a className="text-[var(--leaf)] hover:underline" href={REPO}>It&apos;s all on GitHub.</a>
      </p>
    </section>
  );
}
