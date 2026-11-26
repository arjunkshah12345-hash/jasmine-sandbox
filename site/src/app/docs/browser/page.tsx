import type { Metadata } from "next";
import { Prose, DocTitle } from "@/components/docs/prose";
import { Code } from "@/components/docs/kit";

export const metadata: Metadata = {
  title: "Browser sandboxes: headless Chromium for AI agents · Jasmine",
  description: "Give AI agents a headless Chromium that is already running when the sandbox is created. Connect Playwright or Puppeteer over CDP through the sandbox's preview URL.",
  alternates: { canonical: "/docs/browser/" },
};

const START = "/headless-shell/headless-shell --no-sandbox --disable-gpu --disable-dev-shm-usage --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222 --remote-allow-origins=* about:blank";

export default function Browser() {
  return (
    <>
      <DocTitle kicker="Build" title="Browser sandboxes">
        A template can leave a process running inside its snapshot, so every sandbox starts with it already up. For headless Chromium, that means the
        DevTools Protocol answers the moment the sandbox exists: about 93 ms after it was requested, in CI.
      </DocTitle>
      <Prose>
        <h2 id="connect">Connect Playwright or Puppeteer</h2>
        <p><code>sbx.cdpUrl()</code> returns a WebSocket URL for the browser, through the sandbox&apos;s preview URL.</p>
        <Code lang="typescript">{`import { chromium } from "playwright";
import { Jasmine } from "jasmine-sdk";

const sbx = await new Jasmine().create({ template: "browser" });
const browser = await chromium.connectOverCDP(await sbx.cdpUrl());
// Puppeteer: await puppeteer.connect({ browserWSEndpoint: await sbx.cdpUrl() })`}</Code>
        <p>In Python, <code>sbx.cdp_url()</code> works with Playwright&apos;s <code>chromium.connect_over_cdp(url)</code>.</p>

        <h2 id="template">Build the browser template (self-hosted)</h2>
        <p>On Jasmine Cloud, the <code>browser</code> template is built in. On your own host, build it once:</p>
        <Code>{`sudo jasmined build browser chromedp/headless-shell:stable --mem-mib 2048 --ready-port 9222 \\
  --start '${START}'`}</Code>

        <h2 id="any-server">Any server, already running</h2>
        <p>
          <code>--start</code> runs a command in the background before the snapshot, and <code>--ready-port</code> makes the build wait until it accepts
          connections. <code>--setup</code> runs a command once, to completion, before that (install packages, warm caches). The same options are on{" "}
          <code>POST /v1/templates</code> and <code>buildTemplate()</code>.
        </p>

        <h2 id="websockets">WebSockets through preview URLs</h2>
        <p>Preview URLs pass WebSocket upgrades through, so CDP works over them, and so does hot reload for dev servers your agent starts.</p>

        <h2 id="safety">Isolation</h2>
        <p>The browser runs inside the sandbox&apos;s microVM: it can reach the internet, but not your host, other sandboxes or the cloud metadata endpoint.</p>
      </Prose>
    </>
  );
}
