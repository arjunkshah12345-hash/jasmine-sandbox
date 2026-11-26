import type { Metadata } from "next";
import { Code, Callout } from "@/components/docs/kit";
import { Prose, DocTitle } from "@/components/docs/prose";
import { INSTALL, REPO } from "@/lib/jasmine-data";

export const metadata: Metadata = { title: "Docs: sandboxes for AI agents · Jasmine", description: "Install Jasmine, create your first AI agent sandbox in Python or TypeScript, and wire it into your agent.", alternates: { canonical: "/docs/" } };

export default function DocsHome() {
  return (
    <>
      <DocTitle kicker="Docs" title="Introduction">
        Jasmine gives every agent task its own computer: a Firecracker microVM with its own kernel, restored from a memory snapshot in about 100 ms.
      </DocTitle>
      <Prose>
        <p>
          You run one daemon, <code>jasmined</code>, on a Linux machine with KVM. It turns OCI images into snapshot templates and
          serves an HTTP API on port 7171. The TypeScript and Python SDKs are thin clients for that API.
        </p>

        <h2 id="quickstart">Quickstart</h2>
        <p>On a Linux host with <code>/dev/kvm</code> (bare metal, or a cloud VM with nested virtualization):</p>
        <Code>{`
${INSTALL}
sudo jasmined build default python:3.12-slim   # any OCI image becomes a template
sudo systemctl enable --now jasmined           # API on http://127.0.0.1:7171
`}</Code>
        <p>Create a sandbox and run a command:</p>
        <Code lang="typescript">{`
import { Jasmine } from "jasmine-sdk";

await using sbx = await new Jasmine().create();          // ~100 ms
const r = await sbx.exec("python3 -c 'print(6*7)'");
console.log(r.stdout);                                   // "42\\n"
`}</Code>
        <Code lang="python">{`
from jasmine_sdk import Jasmine

with Jasmine().create() as sbx:
    print(sbx.exec("pip install -q requests && echo ok").stdout)
`}</Code>
        <Callout>
          Using Claude Code, Codex or Cursor? Paste the <a href="/docs/agents">agent setup prompt</a> and let your agent do all of the above,
          including wiring sandboxes into your code.
        </Callout>

        <h2 id="what-you-get">What you get</h2>
        <ul>
          <li><strong>Hardware isolation.</strong> Each sandbox is a microVM with its own kernel, not a container sharing yours.</li>
          <li><strong>Fast, flat creates.</strong> Sandboxes restore from a snapshot of an already-booted template, so create time doesn&apos;t grow with what the image does at boot.</li>
          <li><strong>Pause, resume and snapshot.</strong> Pause keeps memory and running processes. A snapshot becomes a template you can start copies from.</li>
          <li><strong>Internet with guard rails.</strong> DNS, HTTPS and package installs work. The cloud metadata endpoint, host services and other sandboxes are blocked.</li>
          <li><strong>Preview URLs.</strong> Any port inside a sandbox is reachable through the API.</li>
        </ul>

        <h2 id="next">Next</h2>
        <ul>
          <li><a href="/docs/concepts">Concepts</a>: templates, snapshots, lifecycle and isolation.</li>
          <li><a href="/docs/sdk">SDKs</a>: every method in TypeScript and Python.</li>
          <li><a href="/docs/api">HTTP API</a>: for any other language.</li>
          <li><a href="/docs/self-hosting">Self-hosting</a>: requirements, auth, sizing and operations.</li>
          <li><a href={REPO}>Source on GitHub</a>.</li>
        </ul>
      </Prose>
    </>
  );
}
