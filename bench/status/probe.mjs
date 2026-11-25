// Jasmine Cloud uptime probe, run every 10 minutes by .github/workflows/status.yml.
// One check = create a sandbox, run a command, delete it, through the public API, exactly as a
// customer would. Appends the result to <dir>/checks.json (90 days) and rewrites <dir>/summary.json.
//   JASMINE_URL=https://api.tryjasmine.dev JASMINE_API_KEY=... node bench/status/probe.mjs <dir>
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const URL_ = (process.env.JASMINE_URL ?? "https://api.tryjasmine.dev").replace(/\/$/, "");
const KEY = process.env.JASMINE_API_KEY;
const dir = process.argv[2] ?? "status";
const KEEP_DAYS = 90;

async function call(method, path, body) {
  const res = await fetch(URL_ + path, {
    method,
    headers: { authorization: `Bearer ${KEY}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

async function check() {
  const t = Math.floor(Date.now() / 1000);
  let id;
  try {
    const t0 = performance.now();
    const sbx = await call("POST", "/v1/sandboxes", { template: "default", labels: { purpose: "status-probe" } });
    id = sbx.id;
    const create_ms = Math.round(performance.now() - t0);
    const t1 = performance.now();
    const r = await call("POST", `/v1/sandboxes/${id}/exec`, { cmd: "echo ok" });
    const exec_ms = Math.round(performance.now() - t1);
    if (r.exit_code !== 0 || r.stdout.trim() !== "ok") throw new Error(`exec returned ${JSON.stringify(r).slice(0, 200)}`);
    return { t, ok: true, create_ms, exec_ms };
  } catch (e) {
    return { t, ok: false, error: String(e.message ?? e).slice(0, 300) };
  } finally {
    if (id) await call("DELETE", `/v1/sandboxes/${id}`).catch(() => {});
  }
}

// One retry before recording a failure, so a single dropped connection on the runner's side
// doesn't count as an outage; both attempts' errors are kept.
let c = await check();
if (!c.ok) {
  await new Promise((r) => setTimeout(r, 15_000));
  const again = await check();
  c = again.ok ? { ...again, retried: c.error } : { ...again, error: `${c.error} | retry: ${again.error}` };
}

mkdirSync(dir, { recursive: true });
let checks = [];
try {
  checks = JSON.parse(readFileSync(`${dir}/checks.json`, "utf8"));
} catch {}
const now = Math.floor(Date.now() / 1000);
checks = [...checks, c].filter((x) => x.t > now - KEEP_DAYS * 86400);
writeFileSync(`${dir}/checks.json`, JSON.stringify(checks));

const window_ = (days) => {
  const xs = checks.filter((x) => x.t > now - days * 86400);
  const ok = xs.filter((x) => x.ok);
  const lat = ok.map((x) => x.create_ms).sort((a, b) => a - b);
  return {
    checks: xs.length,
    uptime: xs.length ? Math.round((ok.length / xs.length) * 1e5) / 1e3 : null,
    create_ms_p50: lat.length ? lat[Math.floor(lat.length * 0.5)] : null,
    create_ms_p95: lat.length ? lat[Math.min(lat.length - 1, Math.floor(lat.length * 0.95))] : null,
  };
};
// Daily buckets for the bar strip: share of passing checks per UTC day.
const days = [];
for (let d = KEEP_DAYS - 1; d >= 0; d--) {
  const start = Math.floor(now / 86400 - d) * 86400;
  const xs = checks.filter((x) => x.t >= start && x.t < start + 86400);
  days.push({ day: new Date(start * 1000).toISOString().slice(0, 10), checks: xs.length, ok: xs.filter((x) => x.ok).length });
}
const summary = {
  updated: now,
  target: URL_,
  method: "Every 10 minutes from GitHub Actions: create a sandbox, run a command, delete it, through the public API. A check fails only if it fails twice, 15 s apart.",
  current: c.ok ? "operational" : "failing",
  last: c,
  last_failures: checks.filter((x) => !x.ok).slice(-10).reverse(),
  "24h": window_(1),
  "7d": window_(7),
  "30d": window_(30),
  "90d": window_(90),
  days,
};
writeFileSync(`${dir}/summary.json`, JSON.stringify(summary, null, 1));
console.log(JSON.stringify({ check: c, uptime_30d: summary["30d"].uptime }));
