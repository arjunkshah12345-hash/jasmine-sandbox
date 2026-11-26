import type { Metadata } from "next";
import { Code, Callout } from "@/components/docs/kit";
import { Prose, DocTitle } from "@/components/docs/prose";
import { INSTALL } from "@/lib/jasmine-data";

export const metadata: Metadata = { title: "Self-host sandboxes for AI agents on Linux · Jasmine", description: "Run Jasmine on your own Linux machine with KVM: install, templates, configuration, unprivileged VMMs and the guest kernel.", alternates: { canonical: "/docs/self-hosting/" } };

const env: [string, string, string][] = [
  ["JASMINE_API_KEY", "unset", "Require Authorization: Bearer <key> on /v1."],
  ["JASMINE_LISTEN", "127.0.0.1:7171", "Address for the HTTP API."],
  ["JASMINE_DATA", "/var/lib/jasmine", "Templates, sandbox disks and snapshots. Must be XFS with reflink."],
  ["JASMINE_NET_POOL", "32", "Network slots kept pre-built. More are built on demand, slower."],
  ["JASMINE_KERNEL", "/var/lib/jasmine/vmlinux", "Guest kernel."],
  ["JASMINE_FIRECRACKER", "/usr/local/bin/firecracker", "Firecracker binary."],
  ["JASMINE_VM_UID_BASE", "unset", "Run each VMM as an unprivileged uid (base + 1 + slot) instead of root. Set it on hosts that run other people's code."],
];

export default function SelfHosting() {
  return (
    <>
      <DocTitle kicker="Run" title="Self-hosting">
        One static binary and a systemd unit. No database, no control plane, no account.
      </DocTitle>
      <Prose>
        <h2 id="requirements">Requirements</h2>
        <ul>
          <li>Linux on x86_64 or arm64 with <code>/dev/kvm</code>. Bare metal is fastest; cloud VMs need nested virtualization.</li>
          <li>Root, to manage network namespaces, taps and the reflink store.</li>
          <li>Disk for templates. Sandbox disks are copy-on-write, so each one costs only what it writes.</li>
        </ul>
        <Callout>
          Hetzner&apos;s bare-metal servers are a good price-to-performance fit. Most cloud VMs either lack KVM or pay a nested-virtualization tax;
          our published benchmarks ran on exactly that kind of VM, so bare metal should be faster.
        </Callout>

        <h2 id="install">Install</h2>
        <Code>{`
${INSTALL}
sudo jasmined build default python:3.12-slim
sudo systemctl enable --now jasmined
curl -fsS http://127.0.0.1:7171/healthz      # ok
`}</Code>
        <p>The installer downloads the release for your architecture, checks its SHA-256 checksum, and installs Firecracker, the guest kernel, the agent and the unit file.</p>

        <h2 id="auth">Auth and exposure</h2>
        <p>The API listens on localhost only. To use it from other machines, set a key and put it behind TLS:</p>
        <Code title="/etc/jasmine/env">{`
JASMINE_API_KEY=jsm_your_key_from_the_dashboard
JASMINE_LISTEN=0.0.0.0:7171
`}</Code>
        <p>
          Then <code>sudo systemctl restart jasmined</code>. Use a reverse proxy (Caddy, nginx), a tunnel or a private network for TLS. Never expose
          the port without a key: whoever can reach it can run code on your machine, inside a VM.
        </p>

        <h2 id="templates">Templates</h2>
        <Code>{`
sudo jasmined build node node:22-bookworm --vcpus 2 --mem-mib 4096
sudo jasmined build default-4x8192 python:3.12-slim --vcpus 4 --mem-mib 8192
`}</Code>
        <p>
          A build unpacks the image to a disk, boots it, reads its binaries and libraries into the page cache (<code>--prewarm-mib</code>, default
          256) and snapshots it. You can also build templates over the API, and any running sandbox can become one with <code>snapshot()</code>.
        </p>

        <h2 id="config">Configuration</h2>
        <table>
          <thead><tr><th>Variable</th><th>Default</th><th>Meaning</th></tr></thead>
          <tbody>
            {env.map(([k, d, m]) => (
              <tr key={k}><td><code>{k}</code></td><td className="font-mono text-xs text-zinc-500">{d}</td><td>{m}</td></tr>
            ))}
          </tbody>
        </table>

        <h2 id="limits">Know the limits</h2>
        <ul>
          <li>One host. A multi-host scheduler is on the roadmap.</li>
          <li>Running sandboxes don&apos;t survive a daemon restart. Snapshot anything you need to keep.</li>
          <li>Raw CPU and disk throughput trail containers by the usual VM tax. Lifecycle and command latency are where Jasmine leads.</li>
        </ul>
      </Prose>
    </>
  );
}
