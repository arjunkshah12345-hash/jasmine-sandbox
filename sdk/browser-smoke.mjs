// Browser template end to end: Chromium is already running in the snapshot, and the
// DevTools Protocol works over the sandbox's preview URL (HTTP and WebSocket).
// Needs a template named "browser" (see README: "Browser sandboxes") and Node 22+ (global WebSocket).
import { Jasmine } from "./typescript/dist/index.js";

const jasmine = new Jasmine();
const t0 = performance.now();
const sbx = await jasmine.create({ template: process.env.JASMINE_BROWSER_TEMPLATE ?? "browser" });
const created = performance.now() - t0;

try {
  // CDP answers straight away: the browser was captured running, not started now.
  const url = await sbx.cdpUrl();
  const firstCdp = performance.now() - t0;
  if (!/^wss?:\/\/.+\/ports\/9222\/devtools\/browser\//.test(url)) throw new Error(`bad CDP url: ${url}`);

  const ws = new WebSocket(url);
  await new Promise((ok, fail) => {
    ws.onopen = ok;
    ws.onerror = () => fail(new Error(`websocket to ${url} failed`));
  });
  let n = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { ok, fail } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? fail(new Error(JSON.stringify(msg.error))) : ok(msg.result);
    }
  };
  const call = (method, params = {}, sessionId) =>
    new Promise((ok, fail) => {
      const id = ++n;
      pending.set(id, { ok, fail });
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });

  const ver = await call("Browser.getVersion");
  // Open a page, render it, and read the DOM back.
  const { targetId } = await call("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await call("Target.attachToTarget", { targetId, flatten: true });
  await call("Page.navigate", { url: "data:text/html,<title>jasmine</title><h1 id=h>hello from a sandbox</h1>" }, sessionId);
  let text;
  for (let i = 0; i < 50 && !text; i++) {
    const r = await call("Runtime.evaluate", { expression: "document.getElementById('h')?.textContent", returnByValue: true }, sessionId);
    text = r.result.value;
    if (!text) await new Promise((r) => setTimeout(r, 100));
  }
  if (text !== "hello from a sandbox") throw new Error(`page did not render: ${JSON.stringify(text)}`);
  // And it can reach the internet.
  await call("Page.navigate", { url: "https://example.com/" }, sessionId);
  let title;
  for (let i = 0; i < 100 && title !== "Example Domain"; i++) {
    title = (await call("Runtime.evaluate", { expression: "document.title", returnByValue: true }, sessionId)).result.value;
    if (title !== "Example Domain") await new Promise((r) => setTimeout(r, 100));
  }
  if (title !== "Example Domain") throw new Error(`could not load example.com (title ${JSON.stringify(title)})`);
  ws.close();
  console.log(JSON.stringify({ ok: true, browser: ver.product, create_ms: Math.round(created), create_to_cdp_ms: Math.round(firstCdp) }));
} finally {
  await sbx.delete();
}
