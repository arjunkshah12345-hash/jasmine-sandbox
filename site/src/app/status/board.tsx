"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/site2/bits";
import { REPO } from "@/lib/jasmine-data";

// Written every 10 minutes by .github/workflows/status.yml (bench/status/probe.mjs).
const DATA = "https://raw.githubusercontent.com/arjunkshah12345-hash/jasmine-sandbox/status/summary.json";

type Window = { checks: number; uptime: number | null; create_ms_p50: number | null; create_ms_p95: number | null };
type Check = { t: number; ok: boolean; create_ms?: number; exec_ms?: number; error?: string };
type Summary = {
  updated: number;
  method: string;
  current: "operational" | "failing";
  last: Check;
  last_failures: Check[];
  "24h": Window;
  "7d": Window;
  "30d": Window;
  "90d": Window;
  days: { day: string; checks: number; ok: number }[];
};

const pct = (x: number | null) => (x === null ? "–" : `${x.toFixed(x === 100 ? 0 : 2)}%`);
const ago = (t: number) => {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - t);
  return s < 90 ? `${s} s ago` : s < 5400 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`;
};

export function StatusBoard() {
  const [s, setS] = useState<Summary | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    fetch(DATA, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setS)
      .catch(() => setErr(true));
  }, []);

  if (err)
    return (
      <p className="mx-auto max-w-4xl px-6 pb-24 text-center text-sm text-zinc-500">
        No measurements published yet. They start once the probe has an API key.
      </p>
    );
  if (!s) return <p className="mx-auto max-w-4xl px-6 pb-24 text-center text-sm text-zinc-500">Loading…</p>;

  // Older than 30 min means the probe itself stopped; say so instead of showing a stale green.
  const stale = Date.now() / 1000 - s.updated > 1800;
  const up = s.current === "operational" && !stale;
  return (
    <section className="mx-auto max-w-4xl space-y-4 px-6 pb-24">
      <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
        <div className="flex items-center gap-3">
          <span className={`h-3 w-3 rounded-full ${up ? "bg-[var(--leaf)]" : stale ? "bg-zinc-500" : "bg-red-400"}`} />
          <span className="text-lg font-medium text-white">
            {stale ? "No recent measurement" : up ? "All systems operational" : "Checks are failing"}
          </span>
        </div>
        <span className="text-sm text-zinc-500">Last check {ago(s.updated)}</span>
      </Card>

      <div className="grid gap-4 sm:grid-cols-4">
        {(["24h", "7d", "30d", "90d"] as const).map((k) => (
          <Card key={k} className="p-5">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Uptime · {k}</p>
            <p className="mt-2 font-mono text-2xl text-white">{pct(s[k].uptime)}</p>
            <p className="mt-1 text-xs text-zinc-500">
              {s[k].checks} checks{s[k].create_ms_p50 !== null && ` · create p50 ${s[k].create_ms_p50} ms`}
            </p>
          </Card>
        ))}
      </div>

      <Card className="p-6">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-medium text-white">Last 90 days</p>
          <p className="text-xs text-zinc-500">each bar is one UTC day</p>
        </div>
        <div className="mt-4 flex h-10 items-end gap-[2px]">
          {s.days.map((d) => {
            const r = d.checks ? d.ok / d.checks : null;
            const c = r === null ? "bg-white/[0.06]" : r === 1 ? "bg-[var(--leaf)]" : r >= 0.99 ? "bg-[var(--leaf)]/60" : "bg-red-400";
            return <div key={d.day} title={`${d.day}: ${d.checks ? `${d.ok}/${d.checks} checks passed` : "no data"}`} className={`h-full flex-1 rounded-[1px] ${c}`} />;
          })}
        </div>
        <div className="mt-2 flex justify-between text-xs text-zinc-600">
          <span>90 days ago</span>
          <span>today</span>
        </div>
      </Card>

      {s.last_failures.length > 0 && (
        <Card className="p-6">
          <p className="text-sm font-medium text-white">Recent failed checks</p>
          <ul className="mt-3 space-y-2 font-mono text-xs text-zinc-400">
            {s.last_failures.map((f) => (
              <li key={f.t}>
                <span className="text-zinc-500">{new Date(f.t * 1000).toISOString().replace("T", " ").slice(0, 16)} UTC</span> {f.error}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="pt-2 text-center text-xs text-zinc-500">
        {s.method}{" "}
        <a className="underline hover:text-zinc-300" href={`${REPO}/blob/master/bench/status/probe.mjs`}>Probe</a> ·{" "}
        <a className="underline hover:text-zinc-300" href={`${REPO}/tree/status`}>Raw data</a>
      </p>
    </section>
  );
}
