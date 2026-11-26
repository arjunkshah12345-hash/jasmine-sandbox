import type { Metadata } from "next";
import { Code, Callout } from "@/components/docs/kit";
import { Prose, DocTitle } from "@/components/docs/prose";

export const metadata: Metadata = { title: "Python and TypeScript SDKs for AI agent sandboxes · Jasmine", description: "Create sandboxes, run commands, move files, pause, snapshot, fork, open a browser and mount S3 from Python or TypeScript. Zero dependencies.", alternates: { canonical: "/docs/sdk/" } };

const methods: [string, string, string][] = [
  ["new Jasmine(opts?)", "Jasmine(url=None, api_key=None)", "Client. Reads JASMINE_URL (default http://127.0.0.1:7171) and JASMINE_API_KEY."],
  ["jasmine.create({ template? })", "jasmine.create(template=\"default\")", "Restore a new sandbox from a template."],
  ["jasmine.get(id)", "jasmine.get(id)", "Attach to an existing sandbox."],
  ["jasmine.list()", "jasmine.list()", "All sandboxes on the host."],
  ["jasmine.templates()", "jasmine.templates()", "All templates."],
  ["jasmine.buildTemplate({ name, image, vcpus?, memMib?, setup?, start?, readyPort? })", "jasmine.build_template(name, image, vcpus=2, mem_mib=1024, setup=, start=, ready_port=)", "Turn an OCI image into a template. setup runs once; start is left running in the snapshot."],
  ["sbx.exec(cmd, { env, cwd, timeoutMs, stdin })", "sbx.exec(cmd, env=, cwd=, timeout_ms=, stdin=)", "Run a command. A string goes through /bin/sh -c; an array is exec'd directly."],
  ["sbx.files.write(path, data, { mode })", "sbx.write_file(path, data, mode=None)", "Write a file (string or bytes)."],
  ["sbx.files.read(path) / readText(path)", "sbx.read_file(path)", "Read a file."],
  ["sbx.pause()", "sbx.pause()", "Suspend to disk, keeping memory and processes. The next call resumes it."],
  ["sbx.resume()", "sbx.resume()", "Resume explicitly."],
  ["sbx.snapshot()", "sbx.snapshot()", "Save memory, files and processes as a new template."],
  ["sbx.previewUrl(port, path?)", "sbx.preview_url(port, path=\"/\")", "URL that proxies to a port inside the sandbox. WebSockets work too."],
  ["sbx.cdpUrl(port = 9222)", "sbx.cdp_url(port=9222)", "WebSocket URL for the browser in a browser sandbox, for Playwright or Puppeteer."],
  ["sbx.mountS3({ bucket, path?, prefix?, endpoint?, … })", "sbx.mount_s3(bucket, path=, prefix=, endpoint=, …)", "Mount an S3 or S3-compatible bucket as a folder. Returns the path."],
  ["sbx.unmount(path)", "sbx.unmount(path)", "Unmount a bucket."],
  ["sbx.delete()", "sbx.delete()", "Stop the VM and free its disk and network slot."],
];

export default function Sdk() {
  return (
    <>
      <DocTitle kicker="Build" title="SDKs">
        Two small clients for the same HTTP API. TypeScript has zero dependencies; Python uses only the standard library.
      </DocTitle>
      <Prose>
        <h2 id="install">Install</h2>
        <Code lang="python">{`pip install "git+https://github.com/arjunkshah12345-hash/jasmine-sandbox#subdirectory=sdk/python"`}</Code>
        <Code lang="typescript">{`
git clone --depth 1 https://github.com/arjunkshah12345-hash/jasmine-sandbox /tmp/jasmine
(cd /tmp/jasmine/sdk/typescript && npm install && npm run build)
npm install /tmp/jasmine/sdk/typescript
`}</Code>
        <Callout>The packages aren&apos;t on npm or PyPI yet, so install from source. The import names stay the same once they are: <code>jasmine-sdk</code> in TypeScript, <code>jasmine_sdk</code> in Python.</Callout>

        <h2 id="example">A full loop</h2>
        <Code lang="typescript">{`
import { Jasmine } from "jasmine-sdk";
const jasmine = new Jasmine();

const sbx = await jasmine.create();
await sbx.files.write("/work/main.py", "print(sum(range(10)))");
const r = await sbx.exec("python3 main.py", { cwd: "/work", timeoutMs: 10_000 });
console.log(r.exitCode, r.stdout, r.durationMs);

await sbx.pause();                    // between agent turns: no CPU, state kept
const again = await sbx.exec("ls /work");   // resumes on its own

const tpl = await sbx.snapshot();     // branch point
const fork = await jasmine.create({ template: tpl.name });
await fork.delete();
await sbx.delete();
`}</Code>
        <Code lang="python">{`
from jasmine_sdk import Jasmine
jasmine = Jasmine()

with jasmine.create() as sbx:
    sbx.write_file("/work/main.py", "print(sum(range(10)))")
    r = sbx.exec("python3 main.py", cwd="/work", timeout_ms=10_000)
    print(r.exit_code, r.stdout, r.ok)

    sbx.exec("python3 -m http.server 3000 >/dev/null 2>&1 &")
    print(sbx.preview_url(3000))
`}</Code>

        <h2 id="reference">Reference</h2>
        <table>
          <thead>
            <tr><th>TypeScript</th><th>Python</th><th>What it does</th></tr>
          </thead>
          <tbody>
            {methods.map(([ts, py, d]) => (
              <tr key={ts}><td><code>{ts}</code></td><td><code>{py}</code></td><td>{d}</td></tr>
            ))}
          </tbody>
        </table>

        <h3 id="exec-result">Exec results</h3>
        <p>
          <code>exec</code> returns <code>exitCode</code>, <code>signal</code>, <code>timedOut</code>, <code>stdout</code>, <code>stderr</code>,
          <code>truncated</code> and <code>durationMs</code> (snake_case in Python, plus <code>ok</code>). A timeout kills the whole process tree.
        </p>
        <h3 id="cleanup">Cleanup</h3>
        <p>
          TypeScript sandboxes support <code>await using</code>, and Python sandboxes are context managers. Both delete the sandbox when the
          scope exits, even on an exception.
        </p>
        <h3 id="errors">Errors</h3>
        <p>Failed requests throw <code>JasmineError</code> with the HTTP status and the daemon&apos;s message.</p>
      </Prose>
    </>
  );
}
