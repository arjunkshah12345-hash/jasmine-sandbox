import type { Metadata } from "next";
import { Prose } from "@/components/docs/prose";
import { JsonLd, faqLd, breadcrumbLd } from "@/components/seo/json-ld";
import { Md } from "@/components/seo/md";
import { FB, FAIR_LABELS, SYSTEM_NAMES, fmt } from "@/lib/jasmine-data";
import { Shell, Crumbs, PageTitle, CtaBox } from "../shell";

const title = "Firecracker vs Docker vs gVisor vs Kata for AI agent code (benchmarks)";
const description = "Jasmine (Firecracker microVMs), Docker, gVisor and Kata Containers run on one machine with the same image and limits: start-up, command latency, agent traces, CPU and disk. Which isolation should run AI-generated code?";
export const metadata: Metadata = { title, description, alternates: { canonical: "/compare/docker/" }, openGraph: { title, description, images: ["/og.jpg"] }, twitter: { card: "summary_large_image", title, description, images: ["/og.jpg"] } };

const SYS = ["jasmine", "docker", "gvisor", "kata"];

export default function VsDocker() {
  const ms = Object.entries(FB.metrics).filter(([id]) => FAIR_LABELS[id]);
  const med = (id: string, s: string) => FB.metrics[id]?.bySystem[s]?.median ?? null;
  const wins = ms.filter(([, m]) => m.winner === "jasmine").length;
  const faq = [
    { q: "Is Docker safe for running AI-generated code?", a: "Docker containers share the host's kernel, so a kernel exploit in the container reaches the host. That's fine for code you trust. For code an AI agent wrote, a microVM (its own kernel behind a hardware boundary) or gVisor (a user-space kernel) is the safer default." },
    { q: "Is Firecracker faster than Docker?", a: `For starting sandboxes and running commands, Jasmine's Firecracker microVMs measured faster on the same machine: ${fmt(med("ready_ms", "jasmine"), "ms")} vs ${fmt(med("ready_ms", "docker"), "ms")} to a first command, ${fmt(med("exec_ms", "jasmine"), "ms")} vs ${fmt(med("exec_ms", "docker"), "ms")} per command. Docker wins raw CPU and disk work, because it pays no virtual machine cost.` },
    { q: "What's the difference between gVisor, Kata and Firecracker?", a: "gVisor intercepts system calls with a kernel written in Go, in user space. Kata Containers runs each container inside a lightweight VM managed through containerd. Firecracker is a minimal VM monitor from AWS; Jasmine restores Firecracker VMs from memory snapshots so they start without booting." },
  ];
  return (
    <Shell>
      <JsonLd data={[faqLd(faq), breadcrumbLd([["Home", "/"], ["Compare", "/compare"], ["vs Docker, gVisor, Kata", "/compare/docker"]])]} />
      <Crumbs trail={[["Home", "/"], ["Compare", "/compare"], ["vs Docker, gVisor, Kata", "/compare/docker"]]} />
      <PageTitle kicker="Compare" title="Firecracker vs Docker vs gVisor vs Kata, on one machine">
        Same host, same {FB.limits.image} image, same {FB.limits.cpu} vCPU / {Math.round(FB.limits.memoryMb / 1024)} GiB limits, interleaved rounds. A system wins only if its confidence interval clears every other. Jasmine wins {wins} of {ms.length}.
      </PageTitle>
      <div className="mt-10">
        <Prose>
          <h2 id="table">Which is fastest for an AI agent?</h2>
          <table>
            <thead><tr><th>Measurement</th>{SYS.map((s) => <th key={s}>{SYSTEM_NAMES[s]}</th>)}</tr></thead>
            <tbody>
              {ms.map(([id, m]) => (
                <tr key={id}>
                  <td>{FAIR_LABELS[id].label}</td>
                  {SYS.map((s) => <td key={s}>{m.winner === s ? <strong>{fmt(med(id, s), FAIR_LABELS[id].unit)}</strong> : fmt(med(id, s), FAIR_LABELS[id].unit)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-sm text-zinc-500">Medians from <a href="https://github.com/arjunkshah12345-hash/jasmine-sandbox/tree/master/bench/fair">fairbench</a> on {FB.host.cpu}, {FB.host.cpus} CPUs. Bold marks a statistically clear winner; no bold means no clear winner.</p>
          <h2 id="faq">Questions people ask</h2>
          {faq.map((f) => (<div key={f.q}><h3>{f.q}</h3><p><Md>{f.a}</Md></p></div>))}
        </Prose>
      </div>
      <CtaBox />
    </Shell>
  );
}
