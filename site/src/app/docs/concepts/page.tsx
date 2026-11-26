import type { Metadata } from "next";
import { Prose, DocTitle } from "@/components/docs/prose";

export const metadata: Metadata = { title: "How Jasmine sandboxes work: templates, snapshots, isolation · Jasmine", description: "Templates, memory-snapshot restore, the sandbox lifecycle, and the network and kernel isolation between Firecracker microVMs.", alternates: { canonical: "/docs/concepts/" } };

export default function Concepts() {
  return (
    <>
      <DocTitle kicker="Start" title="Concepts">
        Four ideas explain everything Jasmine does: templates, restores, the lifecycle, and the walls between sandboxes.
      </DocTitle>
      <Prose>
        <h2 id="templates">Templates</h2>
        <p>
          A template is an OCI image that has already been booted once and frozen. Jasmine unpacks the image to a journal-less ext4 disk, boots it
          in a microVM with its tiny agent as PID 1, warms the page cache with the image&apos;s binaries, then snapshots memory and CPU state.
        </p>
        <h2 id="restore">Restore, don&apos;t boot</h2>
        <p>
          Creating a sandbox never boots a kernel. Jasmine makes an XFS reflink of the template&apos;s disk (copy-on-write, constant time whatever the
          image size), maps the snapshot&apos;s memory lazily so pages load only when touched, and resumes the vCPUs. Each restore gets a fresh clock
          and fresh entropy, so sandboxes from one snapshot never share random numbers.
        </p>
        <pre className="my-6 overflow-x-auto rounded-xl border border-white/10 bg-black/50 p-5 font-mono text-[12.5px] leading-relaxed text-zinc-400">{`  image ──build──▶ template ──restore──▶ sandbox ──exec / files──▶ …
                      ▲                    │
                      └──── snapshot ◀─────┤
                                           ├── pause ⇄ resume
                                           └── delete`}</pre>
        <h2 id="lifecycle">Lifecycle</h2>
        <ul>
          <li><strong>Running:</strong> commands and file operations go over virtio-vsock to the agent, as raw framed bytes.</li>
          <li><strong>Paused:</strong> dirty memory is written to disk and the VM stops. No CPU is used. Any call resumes it.</li>
          <li><strong>Snapshot:</strong> memory, disk and processes become a new template; start as many copies as you like.</li>
          <li><strong>Deleted:</strong> the VM is killed, its disk freed and its network slot recycled.</li>
        </ul>
        <h2 id="isolation">Isolation</h2>
        <p>
          Every sandbox is a Firecracker microVM with its own kernel, in its own network namespace. Outbound internet works through NAT, over IPv4 and IPv6. The cloud
          metadata endpoint, the host&apos;s own services and other sandboxes are blocked by firewall rules, and an end-to-end test checks each of those
          on every push.
        </p>
        <h2 id="keys">Keys and labels</h2>
        <p>
          Give a sandbox a unique <code>key</code> (say, a conversation ID) to find it again, and <code>labels</code> to group sandboxes. Both work as
          filters on <code>GET /v1/sandboxes</code>.
        </p>
      </Prose>
    </>
  );
}
