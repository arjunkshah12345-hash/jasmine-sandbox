import type { Metadata } from "next";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Copy } from "@/components/docs/kit";
import { Prose, DocTitle } from "@/components/docs/prose";

export const metadata: Metadata = { title: "Agent setup prompt: give Claude Code, Codex or Cursor a sandbox · Jasmine", description: "One prompt that has your coding agent install Jasmine, start it with a key, run a smoke test and route untrusted code through sandboxes.", alternates: { canonical: "/docs/agents/" } };

export default function AgentPrompt() {
  const prompt = readFileSync(join(process.cwd(), "public/agent-setup.md"), "utf8");
  return (
    <>
      <DocTitle kicker="Start" title="Agent setup prompt">
        Paste this into Claude Code, Codex, Cursor or any coding agent with a terminal. It installs Jasmine, starts the API with a key, runs a smoke test and wires sandboxes into your project.
      </DocTitle>
      <Prose>
        <p>
          Have a key from your <a href="/dashboard">dashboard</a>? Export it as <code>JASMINE_API_KEY</code> before you start the agent and it
          will use it. Agents can also fetch the prompt directly:
        </p>
      </Prose>
      <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-black/50 px-4 py-3 font-mono text-[13px] text-zinc-300">
        <span className="text-[var(--leaf)]">$</span>
        <span className="min-w-0 flex-1 truncate">curl -fsSL https://tryjasmine.dev/agent-setup.md</span>
        <Copy text="curl -fsSL https://tryjasmine.dev/agent-setup.md" />
      </div>
      <div className="mt-8 overflow-hidden rounded-2xl border border-[var(--leaf)]/25 bg-[var(--leaf)]/[0.03]">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
          <span className="font-mono text-xs uppercase tracking-wider text-zinc-400">prompt · {prompt.split(/\s+/).length} words</span>
          <Copy text={prompt} label="Copy prompt" />
        </div>
        <pre className="max-h-[38rem] overflow-auto whitespace-pre-wrap p-5 font-mono text-[12.5px] leading-relaxed text-zinc-300">{prompt}</pre>
      </div>
      <Prose>
        <h2>What it does</h2>
        <ol>
          <li>Checks for <code>/dev/kvm</code>, and asks you for a Linux host if there isn&apos;t one, instead of guessing.</li>
          <li>Installs the release, builds a template that matches your project and starts <code>jasmined</code> under systemd with your key.</li>
          <li>Runs a create, exec and delete smoke test over the HTTP API.</li>
          <li>Installs the SDK and routes your project&apos;s model-generated code through sandboxes, then reports what it changed.</li>
        </ol>
      </Prose>
    </>
  );
}
