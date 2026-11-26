/**
 * Guides at /guides/<slug>. Each section is a question people search for, answered in its first sentence
 * (the "answer it directly underneath" rule), then detail. Inline markdown: `code`, [text](href), **bold**.
 * Facts here must match the product and results/; numbers that already live in data files are quoted from them.
 */
export type Section = { q: string; a: string; more?: string[]; code?: string };
export type Guide = { slug: string; title: string; description: string; kicker: string; updated: string; intro: string; sections: Section[]; related: string[] };

const PY_BASIC = `from jasmine_sdk import Jasmine          # sdk/python, standard library only

with Jasmine().create() as sbx:           # a fresh microVM, ready in ~0.1 s
    r = sbx.exec("python3 -c 'print(6*7)'", timeout_ms=10_000)
    print(r.stdout)                       # deleted when the block ends`;

export const GUIDES: Guide[] = [
  {
    slug: "run-ai-generated-code-safely",
    kicker: "Guide",
    title: "How to run AI-generated code safely",
    description: "Why code from an AI agent needs its own sandbox, what a safe sandbox must block, and how to run it in an isolated microVM in a few lines of Python or TypeScript.",
    updated: "2026-11-25",
    intro: "Run it somewhere it can't hurt anything: a fresh, isolated computer per task, with a time limit, no secrets, and no way to reach your network. Here's what that means in practice.",
    sections: [
      { q: "Is it safe to run code an AI agent wrote?", a: "Not on your own machine. Agents make mistakes (deleting the wrong folder, installing the wrong package) and can be steered by text they read on the web, so treat their code as untrusted.", more: ["The fix isn't to read every line. It's to run every task somewhere disposable, so the worst case is a sandbox you throw away."] },
      { q: "Why isn't a Docker container enough?", a: "Containers share the host's kernel, so one kernel bug can let code escape to the host and to every other container on it.", more: ["A microVM gives each sandbox its own kernel behind a hardware virtualization boundary. Jasmine uses Firecracker, the same VM monitor AWS Lambda uses, and still starts sandboxes faster than Docker on the same machine (see [the benchmarks](/compare/docker))."] },
      { q: "What should a safe sandbox block?", a: "At minimum: other sandboxes, the host's own services, and the cloud metadata endpoint (which hands out credentials).", more: ["Jasmine also blocks outbound email (port 25), gives every command a timeout, and keeps no secrets inside the sandbox unless you pass them in. An end-to-end test checks the network rules on every push."] },
      { q: "How do I run AI-generated code in a sandbox?", a: "Create a sandbox, run the code with a timeout, read the output, and delete the sandbox.", code: PY_BASIC, more: ["The TypeScript SDK has the same shape (`await using sbx = await new Jasmine().create()`), and underneath it's plain HTTP, so any language works."] },
      { q: "Won't a sandbox per task be slow?", a: "Not if it isn't booted. Jasmine restores each sandbox from a memory snapshot of a machine that already booted, so it's ready for its first command in about a tenth of a second.", more: ["Commands then take a few milliseconds each, and you can pause a sandbox between agent turns so it uses no CPU."] },
    ],
    related: ["sandbox-for-claude-code", "what-is-a-microvm", "ai-sandbox-pricing"],
  },
  {
    slug: "sandbox-for-claude-code",
    kicker: "Guide",
    title: "How to give Claude Code, Codex or Cursor a sandbox",
    description: "Set up isolated sandboxes for your coding agent in one paste: the agent installs Jasmine, starts it with a key, runs a smoke test and moves untrusted code into sandboxes.",
    updated: "2026-11-25",
    intro: "Paste one prompt into your coding agent and let it do the setup. It checks for KVM, installs Jasmine, starts it with an API key, runs a smoke test, then routes your model's code into sandboxes and tells you what it changed.",
    sections: [
      { q: "Why should a coding agent use a sandbox?", a: "So the code it writes and runs can't touch your laptop, your files or your cloud account.", more: ["It also makes the agent faster to trust: you can let it run tests, install packages and start servers freely, because every task happens on a computer you can throw away."] },
      { q: "What's the fastest way to set it up?", a: "Copy the [agent setup prompt](/docs/agents) and paste it into Claude Code, Codex or Cursor.", more: ["If your machine has no `/dev/kvm` (most laptops and many cloud VMs), point the agent at [Jasmine Cloud](/docs/cloud) instead: sign in, make a key, and set `JASMINE_URL=https://api.tryjasmine.dev`."] },
      { q: "How does my agent's code call the sandbox?", a: "Through the Python or TypeScript SDK, or plain HTTP: create a sandbox, `exec` commands, read and write files, then delete it.", code: PY_BASIC },
      { q: "Can the agent preview a web app it built?", a: "Yes. Every port inside a sandbox gets a preview URL (`/v1/sandboxes/<id>/ports/<port>/`), and WebSockets work over it, so dev servers with hot reload work too." },
      { q: "Does it work with any model?", a: "Yes. Jasmine doesn't care which model wrote the code; anything that can make an HTTP request can use it." },
    ],
    related: ["run-ai-generated-code-safely", "headless-browser-for-ai-agents", "fix-no-dev-kvm"],
  },
  {
    slug: "headless-browser-for-ai-agents",
    kicker: "Guide",
    title: "How to give an AI agent a headless browser",
    description: "Run headless Chromium in an isolated sandbox for your AI agent, connect with Playwright or Puppeteer over CDP, and have the browser ready the instant the sandbox exists.",
    updated: "2026-11-25",
    intro: "Put the browser in a sandbox, not on your machine, and connect to it over the Chrome DevTools Protocol. With Jasmine the browser is already running when the sandbox is created, so there's no launch wait.",
    sections: [
      { q: "How do I give my AI agent a browser?", a: "Create a sandbox from a template that has headless Chromium running, get its CDP URL, and connect Playwright or Puppeteer to it.", code: `import { chromium } from "playwright";
import { Jasmine } from "jasmine-sdk";

const sbx = await new Jasmine().create({ template: "browser" });
const browser = await chromium.connectOverCDP(await sbx.cdpUrl());
const page = await browser.newPage();
await page.goto("https://example.com");` },
      { q: "Why is the browser already running?", a: "Because it was running when the template's snapshot was taken, and every sandbox is restored from that snapshot.", more: ["In CI, a new browser sandbox accepts CDP connections about 93 ms after it's requested. A template can do this for any server with `--start` and `--ready-port`; see [browser sandboxes](/docs/browser)."] },
      { q: "How do I connect Playwright or Puppeteer to a remote browser?", a: "Use `chromium.connectOverCDP(url)` in Playwright or `puppeteer.connect({ browserWSEndpoint: url })` in Puppeteer, with the WebSocket URL from `sbx.cdpUrl()`." },
      { q: "Is it safe to let an agent browse the web?", a: "Safer in a sandbox: a page that exploits the browser lands in a disposable microVM with its own kernel, not on your machine.", more: ["The sandbox can reach the internet but not your host, other sandboxes or the cloud metadata endpoint."] },
      { q: "Can I build my own browser template?", a: "Yes, from any image with Chromium: `jasmined build browser chromedp/headless-shell:stable --mem-mib 2048 --ready-port 9222 --start '<chromium command>'`. On Jasmine Cloud, use the built-in `browser` template." },
    ],
    related: ["sandbox-for-claude-code", "run-ai-generated-code-safely", "mount-s3-in-a-sandbox"],
  },
  {
    slug: "mount-s3-in-a-sandbox",
    kicker: "Guide",
    title: "How to mount an S3 bucket in a sandbox",
    description: "Mount any S3 or S3-compatible bucket (R2, GCS, MinIO, Tigris) as a folder inside an AI agent's sandbox, read-only or read-write, with nothing to install.",
    updated: "2026-11-25",
    intro: "Call `mountS3` with the bucket and keys, and the bucket appears as a folder in the sandbox. No FUSE packages to install and no credentials on a command line.",
    sections: [
      { q: "How do I mount an S3 bucket in a sandbox?", a: "One call with the bucket name and credentials; it returns the path.", code: `const path = await sbx.mountS3({
  bucket: "datasets",
  prefix: "train",              // optional: one "folder" of the bucket
  accessKeyId, secretAccessKey,
  readOnly: true,
});
await sbx.exec(\`ls \${path}\`);     // /mnt/datasets` },
      { q: "Does it work with R2, GCS, MinIO or Tigris?", a: "Yes. Pass the store's `endpoint` and Jasmine treats it as S3-compatible." },
      { q: "Do I need to install anything in my image?", a: "No. The sandbox's init process doubles as FUSE's mount helper, and the daemon copies a pinned rclone into the sandbox on its first mount." },
      { q: "Are my credentials safe?", a: "They go into the mount process's environment, never onto its command line, and stay inside that one sandbox.", more: ["Leave the keys out to mount a public bucket anonymously."] },
      { q: "How do I unmount it?", a: "Call `sbx.unmount(path)`, or `DELETE /v1/sandboxes/<id>/mounts?path=<path>`." },
    ],
    related: ["headless-browser-for-ai-agents", "fork-an-agent-environment", "run-ai-generated-code-safely"],
  },
  {
    slug: "what-is-a-microvm",
    kicker: "Explainer",
    title: "What is a microVM? (and how is it different from a container?)",
    description: "A microVM is a tiny virtual machine with its own kernel that starts in milliseconds. How microVMs like Firecracker compare to containers and full VMs, and why AI sandboxes use them.",
    updated: "2026-11-25",
    intro: "A microVM is a virtual machine stripped down to the minimum, so it keeps a VM's strong isolation (its own kernel) but starts almost as fast as a container.",
    sections: [
      { q: "What is a microVM?", a: "A small virtual machine with its own kernel and only the few virtual devices it needs: usually a disk, a network card and a serial console.", more: ["Dropping everything else (no BIOS, no USB, no graphics) makes it boot in a fraction of a second and use only a few megabytes of memory for the VM itself."] },
      { q: "What is Firecracker?", a: "Firecracker is an open-source microVM monitor built by AWS for Lambda and Fargate, written in Rust and running on Linux KVM.", more: ["Jasmine runs every sandbox as a Firecracker microVM."] },
      { q: "How is a microVM different from a container?", a: "A container is a process that shares the host's kernel; a microVM has its own kernel behind hardware virtualization.", more: ["So a kernel bug inside a container can reach the host, while code in a microVM has to break out of a virtual machine first. Containers have been faster to start, but snapshot restore closes that gap: Jasmine starts a microVM in 87 ms to a first command, against Docker's 174 ms on the same machine."] },
      { q: "How is a microVM different from a normal virtual machine?", a: "Same isolation, far less of everything else: a normal VM emulates a whole PC and takes seconds to boot; a microVM emulates almost nothing and starts in milliseconds." },
      { q: "Why do AI sandboxes use microVMs?", a: "Because AI agents run code nobody has read, and you want a strong wall around it without making the agent wait." },
    ],
    related: ["what-is-an-ai-sandbox", "run-ai-generated-code-safely", "fix-no-dev-kvm"],
  },
  {
    slug: "what-is-an-ai-sandbox",
    kicker: "Explainer",
    title: "What is an AI sandbox?",
    description: "An AI sandbox is an isolated, disposable computer where an AI agent runs the code it writes. What it does, what makes a good one, and when you need one.",
    updated: "2026-11-25",
    intro: "An AI sandbox is a throwaway computer for an AI agent: it runs the code the agent writes, keeps it away from your systems, and disappears when the task is done.",
    sections: [
      { q: "What does an AI sandbox do?", a: "It gives an agent a place to run code, install packages, read and write files and start servers, without touching anything you care about." },
      { q: "When do I need one?", a: "Whenever a model's output gets executed: coding agents, code interpreters and data analysis, agents that browse the web, and reinforcement learning rollouts." },
      { q: "What makes a good AI sandbox?", a: "Strong isolation, fast start-up, cheap pauses, and a simple API.", more: ["Isolation means its own kernel and a locked-down network. Speed matters because agents create sandboxes all the time and wait on every command. Pausing matters because agents spend most of their time thinking, not running. Snapshots and forks let you branch an agent's work."] },
      { q: "Should I build my own or use one?", a: "Use one unless sandboxes are your product. Jasmine is open source, so you can run it yourself or use [Jasmine Cloud](/docs/cloud)." },
    ],
    related: ["what-is-a-microvm", "run-ai-generated-code-safely", "ai-sandbox-pricing"],
  },
  {
    slug: "fix-no-dev-kvm",
    kicker: "Troubleshooting",
    title: "Fix \"no /dev/kvm\" (Firecracker, Jasmine, and other microVMs)",
    description: "Seeing \"no /dev/kvm: this host cannot run microVMs\" or \"cannot access '/dev/kvm'\"? What it means, how to enable KVM on bare metal and cloud VMs, and the no-KVM option.",
    updated: "2026-11-25",
    intro: "It means the machine can't do hardware virtualization from where you are: either it's switched off, or you're inside a virtual machine that doesn't pass it through.",
    sections: [
      { q: "What does \"no /dev/kvm\" mean?", a: "Linux exposes hardware virtualization as the device `/dev/kvm`; if it's missing, microVM tools like Firecracker can't start any VM.", more: ["Check with `ls -l /dev/kvm`. If it exists but you get a permission error, add your user to the `kvm` group or run as root."] },
      { q: "How do I enable KVM on my own machine?", a: "Turn on virtualization (Intel VT-x or AMD-V/SVM) in the BIOS or UEFI settings, then load the module: `sudo modprobe kvm_intel` or `sudo modprobe kvm_amd`." },
      { q: "How do I get /dev/kvm on a cloud VM?", a: "Use a bare-metal instance, or a VM type that supports nested virtualization with it enabled.", more: ["Bare-metal servers (for example AWS `*.metal` instances or Hetzner dedicated servers) always have it. Some clouds offer nested virtualization on regular VMs, often as an option you turn on when creating the instance; check your provider's docs."] },
      { q: "Can I run it on a Mac?", a: "On an Apple M3 or newer with macOS 15 or later, yes: `limactl start --name=sbx dev/lima-kvm.yaml` gives you a Linux VM with nested KVM (about 15 GB free needed)." },
      { q: "What if I can't get KVM at all?", a: "Use [Jasmine Cloud](/docs/cloud): the same engine and API on machines that have KVM, $2 free with no card, and you move to your own servers later by changing one environment variable." },
    ],
    related: ["what-is-a-microvm", "sandbox-for-claude-code", "ai-sandbox-pricing"],
  },
  {
    slug: "ai-sandbox-pricing",
    kicker: "Guide",
    title: "How much does a sandbox for AI agents cost?",
    description: "What AI agent sandboxes cost per hour and per task, how per-second billing and pausing change the math, and list prices for Jasmine Cloud, E2B, Daytona and Boat.",
    updated: "2026-11-25",
    intro: "For a 4 vCPU, 8 GiB sandbox, hosted prices run from about 3 cents to 33 cents an hour, and self-hosting costs only your hardware. Per-second billing and pausing matter more than the hourly rate.",
    sections: [
      { q: "How much does an AI sandbox cost per hour?", a: "List prices for 4 vCPU and 8 GiB (checked Nov 23, 2026): Jasmine Cloud $0.030, Boat $0.036 plus a $20/month minimum, E2B and Daytona about $0.331.", more: ["Prices change, so check each provider's pricing page before you decide."] },
      { q: "How much does one agent task cost?", a: "At $0.030 an hour, a 30-second task costs about $0.00025, so a dollar runs roughly four thousand of them." },
      { q: "Why does per-second billing matter?", a: "Agent tasks are short. Billing by the minute or the hour can cost several times what you used; per-second billing charges for what ran." },
      { q: "Do I pay while my agent is thinking?", a: "Not if you pause the sandbox. On Jasmine Cloud a paused sandbox keeps its memory and running processes and only pays for storage." },
      { q: "Is there a free option?", a: "Yes: Jasmine is free to self-host on any Linux machine with KVM, and Jasmine Cloud gives $2 of credit with no card. Credit is prepaid, so you can never owe money." },
    ],
    related: ["what-is-an-ai-sandbox", "sandbox-for-claude-code", "fix-no-dev-kvm"],
  },
  {
    slug: "fork-an-agent-environment",
    kicker: "Guide",
    title: "How to fork an AI agent's environment (snapshots for branching and RL)",
    description: "Snapshot a running sandbox (memory, files and processes) and start copies from that exact moment, to branch an agent's work or fan out reinforcement learning rollouts.",
    updated: "2026-11-25",
    intro: "Snapshot the sandbox, then create new sandboxes from the snapshot. Each copy starts with the same files, memory and running processes, from that exact moment.",
    sections: [
      { q: "How do I fork a running sandbox?", a: "Call `snapshot()` to turn it into a template, then `create({ template })` as many times as you want.", code: `const snap = await sbx.snapshot();                       // memory + disk + processes
const forks = await Promise.all([1, 2, 3, 4].map(() =>
  jasmine.create({ template: snap.name })));             // four copies, same moment` },
      { q: "How fast is it?", a: "On aisandboxbench's harness, taking a snapshot took a median of 0.19 s and starting from one 0.10 s, both first of 11 providers measured." },
      { q: "What is it useful for?", a: "Branching an agent's attempts (try three fixes from the same state and keep the best), reinforcement learning rollouts from one starting state, and skipping slow setup by snapshotting after it." },
      { q: "Do the copies share anything?", a: "Only the unchanged pages and disk blocks, copy-on-write. Each copy gets its own clock and fresh randomness, so copies never repeat each other's random numbers." },
    ],
    related: ["what-is-an-ai-sandbox", "mount-s3-in-a-sandbox", "run-ai-generated-code-safely"],
  },
];

export const guide = (slug: string) => GUIDES.find((g) => g.slug === slug);
