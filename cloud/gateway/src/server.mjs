// Jasmine Cloud gateway: the public API at api.tryjasmine.dev.
//
// Same API as a self-hosted jasmined, so the SDKs work unchanged with
// JASMINE_URL=https://api.tryjasmine.dev. On top of the daemon it adds:
//   - per-user API keys (the ones made on the dashboard)
//   - ownership: every sandbox and snapshot belongs to one account
//   - limits, timeouts, and prepaid credit (a free trial, then top-ups)
// Building templates from arbitrary images is not offered on shared hosts.

import http from "node:http";
import { config, EXPIRES, ON_TIMEOUT, OWNER, RESERVED } from "./config.mjs";
import { call, host, hosts, pipe, pipeUpgrade } from "./hosts.mjs";
import { Meter, costUsd } from "./meter.mjs";
import { billing as makeBilling } from "./billing.mjs";
import { openStore } from "./store.mjs";
import { HttpError, nowS, readBody, readJson, send, sha256 } from "./util.mjs";

const store = await openStore();
const billing = makeBilling(store);
const meter = new Meter(store, billing);

// ---------- auth ----------

const keyCache = new Map(); // hash -> { account, at }
const KEY_TTL_MS = 60_000; // a revoked key stops working within a minute

async function authenticate(req) {
  const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1];
  if (!token || !token.startsWith("jsm_")) throw new HttpError(401, "missing or invalid API key (create one at tryjasmine.dev/dashboard)");
  const hash = sha256(token);
  let hit = keyCache.get(hash);
  if (!hit || Date.now() - hit.at > KEY_TTL_MS) {
    hit = { account: await store.accountByKey(hash), at: Date.now() };
    keyCache.set(hash, hit);
  }
  let a = hit.account;
  if (!a) throw new HttpError(401, "missing or invalid API key (create one at tryjasmine.dev/dashboard)");
  if (a.suspended) throw new HttpError(403, "this account is suspended. Email support@tryjasmine.dev.");
  if (!a.trialGranted) {
    // First Cloud request from this account: grant the one-time trial credit.
    await store.grantTrial(a.uid);
    meter.balances.delete(a.uid);
    a = { ...a, trialGranted: true };
    hit.account = a;
  }
  return a;
}

// Trial accounts (no top-up yet) get tighter limits; a user doc can override either.
const limitsOf = (a) => ({ ...config.limits, ...(a.paid ? {} : config.trialLimits), ...(a.limits ?? {}) });

const createLog = new Map(); // uid -> timestamps (ms) of recent creates
function rateLimit(a) {
  const t = Date.now();
  const xs = (createLog.get(a.uid) ?? []).filter((x) => t - x < 60_000);
  if (xs.length >= limitsOf(a).createsPerMinute) throw new HttpError(429, "too many sandbox starts per minute", { retry_after_s: 5 });
  xs.push(t);
  createLog.set(a.uid, xs);
}

async function requireCompute(a, { resuming = false } = {}) {
  const over = await meter.overCap(a.uid, a);
  if (over === "balance") throw new HttpError(402, "out of credit. Top up at tryjasmine.dev/dashboard (paused sandboxes are kept).");
  if (over === "cap") throw new HttpError(402, `the monthly limit of $${limitsOf(a).monthlySpendUsd} set on this account is reached.`);
  const mine = meter.owned(a.uid);
  const L = limitsOf(a);
  if (mine.filter((s) => s.state === "running").length >= L.running)
    throw new HttpError(429, `limit of ${L.running} running sandboxes reached; pause or delete one`);
  if (!resuming && mine.length >= L.total) throw new HttpError(429, `limit of ${L.total} sandboxes reached; delete one`);
}

function ownedSandbox(a, id) {
  const s = meter.sandboxes.get(id);
  if (!s || s.uid !== a.uid) throw new HttpError(404, "sandbox not found");
  return s;
}

async function ownedSnapshot(a, name) {
  const s = await store.snapshot(name);
  if (!s || s.uid !== a.uid) throw new HttpError(404, "template not found");
  return s;
}

// ---------- shaping responses ----------

const unprefixKey = (a, k) => (k?.startsWith(`${a.uid}:`) ? k.slice(a.uid.length + 1) : k);

function clean(a, info) {
  if (!info || typeof info !== "object") return info;
  const labels = Object.fromEntries(Object.entries(info.labels ?? {}).filter(([k]) => !k.startsWith(RESERVED)));
  const out = { ...info, labels };
  if (info.key) out.key = unprefixKey(a, info.key);
  const exp = Number(info.labels?.[EXPIRES] ?? 0);
  if (exp) out.timeout_at = exp;
  if (info.labels?.[ON_TIMEOUT]) out.on_timeout = info.labels[ON_TIMEOUT];
  return out;
}

const isSnapshot = (name) => typeof name === "string" && name.startsWith("snap_");

// ---------- routes ----------

async function createSandbox(a, req, res) {
  const body = await readJson(req);
  rateLimit(a);
  await requireCompute(a);
  const L = limitsOf(a);
  if (body.cpu && body.cpu > L.maxVcpus) throw new HttpError(400, `cpu is limited to ${L.maxVcpus}`);
  if (body.memory_mib && body.memory_mib > L.maxMemMib) throw new HttpError(400, `memory_mib is limited to ${L.maxMemMib}`);
  const template = body.template ?? "default";
  let h;
  if (isSnapshot(template)) h = host((await ownedSnapshot(a, template)).host);
  else {
    h = meter.pickHost();
    if (!h) throw new HttpError(503, "no capacity right now; try again shortly");
  }
  const timeout = Math.min(Math.max(Number(body.timeout ?? config.timeoutDefaultS), config.timeoutMinS), config.timeoutMaxS);
  const onTimeout = body.on_timeout === "pause" ? "pause" : "delete";
  const labels = Object.fromEntries(Object.entries(body.labels ?? {}).filter(([k]) => !String(k).startsWith(RESERVED)));
  labels[OWNER] = a.uid;
  labels[EXPIRES] = String(nowS() + timeout);
  labels[ON_TIMEOUT] = onTimeout;
  const r = await call(h, "POST", "/v1/sandboxes", {
    template,
    key: body.key ? `${a.uid}:${body.key}` : undefined,
    labels,
    env: body.env,
    cpu: body.cpu,
    memory_mib: body.memory_mib,
  });
  if (r.status === 201) {
    meter.track(r.body, h.id);
    const s = meter.sandboxes.get(r.body.id);
    if (s && (s.vcpus > L.maxVcpus || s.memMib > L.maxMemMib)) {
      await call(h, "DELETE", `/v1/sandboxes/${r.body.id}`);
      meter.forget(r.body.id);
      throw new HttpError(400, `template ${template} is larger than this account's limit of ${L.maxVcpus} vCPU / ${L.maxMemMib} MiB`);
    }
  }
  if (r.status === 409 && body.key) r.body = { error: `a sandbox with key ${JSON.stringify(body.key)} already exists` };
  send(res, r.status, clean(a, r.body));
}

async function listSandboxes(a, url, res) {
  const q = new URLSearchParams();
  for (const [k, v] of url.searchParams) {
    if (k.startsWith(`label.${RESERVED}`)) continue;
    q.append(k, k === "key" ? `${a.uid}:${v}` : v);
  }
  q.append(`label.${OWNER}`, a.uid);
  const lists = await Promise.all(
    hosts().map((h) => call(h, "GET", `/v1/sandboxes?${q}`, undefined, 10_000).catch(() => ({ status: 503, body: [] }))),
  );
  const all = lists.flatMap((r) => (Array.isArray(r.body) ? r.body : [])).filter((s) => s.labels?.[OWNER] === a.uid);
  all.sort((x, y) => x.created_unix - y.created_unix);
  send(res, 200, all.map((s) => clean(a, s)));
}

async function listTemplates(a, res) {
  const h = meter.pickHost();
  if (!h) throw new HttpError(503, "no capacity right now; try again shortly");
  const r = await call(h, "GET", "/v1/templates");
  const mine = (await store.allSnapshots()).filter((s) => s.uid === a.uid).map((s) => s.name);
  const pub = (Array.isArray(r.body) ? r.body : []).filter((t) => !isSnapshot(t.name));
  const own = [];
  for (const name of mine) {
    const s = await store.snapshot(name);
    const t = await call(host(s.host), "GET", `/v1/templates/${name}`).catch(() => null);
    if (t?.status === 200) own.push({ ...t.body, source_sandbox: undefined });
  }
  send(res, 200, [...pub, ...own]);
}

async function me(a, res) {
  const usage = await meter.monthUsage(a.uid);
  const mine = meter.owned(a.uid);
  send(res, 200, {
    uid: a.uid,
    balance_usd: round(await meter.balance(a.uid)),
    trial: !a.paid,
    limits: limitsOf(a),
    rates: config.rates,
    month: { ...usage, usd: round(usage.usd) },
    sandboxes: { running: mine.filter((s) => s.state === "running").length, paused: mine.filter((s) => s.state === "paused").length },
  });
}
const round = (x) => Math.round(x * 1e4) / 1e4;

async function api(req, res, url) {
  const a = await authenticate(req);
  const p = url.pathname.split("/").filter(Boolean); // ["v1", ...]
  const m = req.method;

  if (p[1] === "me" && p.length === 2 && m === "GET") return me(a, res);

  if (p[1] === "templates") {
    if (p.length === 2 && m === "GET") return listTemplates(a, res);
    if (p.length === 2 && m === "POST")
      throw new HttpError(403, "custom templates aren't available on Jasmine Cloud yet. Start from a built-in template, then snapshot it.");
    if (p.length === 3) {
      const s = isSnapshot(p[2]) ? await ownedSnapshot(a, p[2]) : null;
      if (m === "GET") {
        const r = await call(s ? host(s.host) : meter.pickHost() ?? hosts()[0], "GET", `/v1/templates/${p[2]}`);
        return send(res, r.status, r.status === 200 ? { ...r.body, source_sandbox: undefined } : r.body);
      }
      if (m === "DELETE") {
        if (!s) throw new HttpError(403, "built-in templates can't be deleted");
        const r = await call(host(s.host), "DELETE", `/v1/templates/${p[2]}`);
        if (r.status < 300 || r.status === 404) {
          await store.deleteSnapshot(p[2]);
          meter.snapshots = meter.snapshots.filter((x) => x.name !== p[2]);
        }
        return send(res, r.status === 404 ? 204 : r.status, r.status < 300 || r.status === 404 ? undefined : r.body);
      }
    }
  }

  if (p[1] === "sandboxes") {
    if (p.length === 2 && m === "POST") return createSandbox(a, req, res);
    if (p.length === 2 && m === "GET") return listSandboxes(a, url, res);
    const s = ownedSandbox(a, p[2]);
    const h = host(s.host);
    const rest = p.slice(3);
    if (rest.length === 0 && m === "GET") {
      const r = await call(h, "GET", `/v1/sandboxes/${s.id}`);
      return send(res, r.status, clean(a, r.body));
    }
    if (rest.length === 0 && m === "DELETE") {
      const r = await call(h, "DELETE", `/v1/sandboxes/${s.id}`);
      meter.forget(s.id);
      return send(res, r.status === 404 ? 204 : r.status, r.status < 300 ? undefined : r.body);
    }
    if (rest[0] === "pause" && m === "POST") {
      const r = await call(h, "POST", `/v1/sandboxes/${s.id}/pause`);
      if (r.status < 300) Object.assign(s, { state: "paused", pausedSince: nowS() });
      return send(res, r.status, r.body);
    }
    if (s.state === "paused" && ["resume", "exec", "files", "snapshot", "mounts"].includes(rest[0])) {
      // These wake a paused sandbox, so they need room under the limits.
      await requireCompute(a, { resuming: true });
    }
    if (rest[0] === "resume" && m === "POST") {
      const r = await call(h, "POST", `/v1/sandboxes/${s.id}/resume`);
      if (r.status < 300) Object.assign(s, { state: "running", pausedSince: null });
      return send(res, r.status, r.body);
    }
    if (rest[0] === "snapshot" && m === "POST") {
      const n = (await store.allSnapshots()).filter((x) => x.uid === a.uid).length;
      if (n >= limitsOf(a).snapshots) throw new HttpError(429, `limit of ${limitsOf(a).snapshots} snapshots reached; delete one`);
      const r = await call(h, "POST", `/v1/sandboxes/${s.id}/snapshot`);
      if (r.status < 300 && r.body?.name) {
        const snap = { name: r.body.name, uid: a.uid, host: h.id, memMib: r.body.mem_mib ?? s.memMib, createdAt: nowS() };
        await store.putSnapshot(snap);
        meter.snapshots.push(snap);
        Object.assign(s, { state: "running", pausedSince: null });
      }
      return send(res, r.status, r.status < 300 ? { ...r.body, source_sandbox: undefined } : r.body);
    }
    if (["exec", "files", "mounts"].includes(rest[0])) {
      Object.assign(s, { state: "running", pausedSince: null });
      return pipe(h, req, res, url.pathname + url.search);
    }
  }
  throw new HttpError(404, "not found");
}

// ---------- billing endpoints (called by the dashboard with a Firebase ID token) ----------

const CORS = {
  "access-control-allow-origin": config.stripe.siteUrl,
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "POST, GET, OPTIONS",
  "access-control-max-age": "600",
};

async function billingRoute(req, res, url) {
  if (url.pathname === "/billing/webhook" && req.method === "POST") {
    const raw = (await readBody(req)).toString("utf8");
    const uid = await billing.webhook(raw, req.headers["stripe-signature"]);
    if (uid) {
      // New credit and trial limits lifted: drop cached copies of this account.
      meter.balances.delete(uid);
      for (const [h, v] of keyCache) if (v.account?.uid === uid) keyCache.delete(h);
    }
    return send(res, 200, { received: true });
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    return res.end();
  }
  const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1];
  let user;
  try {
    user = await store.verifyIdToken(token);
  } catch {
    throw new HttpError(401, "sign in again");
  }
  if (url.pathname === "/billing/checkout" && req.method === "POST") {
    const { amount } = await readJson(req);
    return send(res, 200, { url: await billing.checkout(user.uid, user.email, amount) }, CORS);
  }
  if (url.pathname === "/billing/usage" && req.method === "GET") {
    const u = await meter.monthUsage(user.uid);
    return send(res, 200, { month: u, balance_usd: round(await meter.balance(user.uid)), top_ups_usd: config.topUpsUsd, rates: config.rates }, CORS);
  }
  throw new HttpError(404, "not found");
}

// ---------- previews ----------

// /v1/sandboxes/{id}/ports/{port}/... is public so it opens in a browser: the
// sandbox ID (64 random bits) is the secret, as with other hosted sandboxes.
// Visiting a preview never wakes a paused sandbox.
const PREVIEW = /^\/v1\/sandboxes\/([^/]+)\/ports\/\d+(\/|$)/;

function previewSandbox(url) {
  const s = meter.sandboxes.get(PREVIEW.exec(url.pathname)?.[1]);
  if (!s) throw new HttpError(404, "sandbox not found");
  if (s.state === "paused") throw new HttpError(409, "this sandbox is paused");
  return s;
}

function previewRoute(req, res, url) {
  const s = previewSandbox(url);
  delete req.headers.authorization; // never forward a customer key into the sandbox
  pipe(host(s.host), req, res, url.pathname + url.search);
}

// ---------- server ----------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://gateway");
  try {
    if (url.pathname === "/healthz") return send(res, 200, { ok: true, hosts: Object.fromEntries(meter.hostUp) });
    if (url.pathname.startsWith("/billing/")) return await billingRoute(req, res, url);
    if (PREVIEW.test(url.pathname)) return previewRoute(req, res, url);
    if (url.pathname.startsWith("/v1/")) return await api(req, res, url);
    throw new HttpError(404, "not found");
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error(req.method, url.pathname, e);
    if (res.headersSent) return res.destroy();
    const cors = url.pathname.startsWith("/billing/") ? CORS : {};
    send(res, status, { error: status === 500 ? "internal error" : e.message, ...(e.extra ?? {}) }, cors);
  }
});

server.on("upgrade", async (req, socket, head) => {
  try {
    const url = new URL(req.url, "http://gateway");
    if (!PREVIEW.test(url.pathname)) throw new Error("no upgrade here");
    const s = previewSandbox(url);
    delete req.headers.authorization;
    pipeUpgrade(host(s.host), req, socket, head, url.pathname + url.search);
  } catch {
    socket.end("HTTP/1.1 404 Not Found\r\n\r\n");
  }
});

await meter.start();
server.listen(config.port, () => console.log(`jasmine cloud gateway on :${config.port} (${hosts().length} host(s), store=${config.store}, payments=${billing.enabled})`));

const shutdown = async () => {
  server.close();
  meter.stop();
  await meter.flush().catch(() => {});
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

export { costUsd };
