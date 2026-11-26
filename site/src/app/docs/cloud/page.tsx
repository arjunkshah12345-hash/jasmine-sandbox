import type { Metadata } from "next";
import { Code, Callout } from "@/components/docs/kit";
import { Prose, DocTitle } from "@/components/docs/prose";
import { RATES, STD, stdHour, usd } from "@/lib/pricing";

export const metadata: Metadata = { title: "Jasmine Cloud: hosted sandboxes for AI agents · Jasmine", description: "Hosted Jasmine sandboxes with the same API: $0.030/hour for 4 vCPU / 8 GiB, billed per second from prepaid credit, $2 free.", alternates: { canonical: "/docs/cloud/" } };

const limits: [string, string, string][] = [
  ["Running at once", "2", "20"],
  ["Sandboxes in total (running + paused)", "5", "100"],
  ["Largest sandbox", "4 vCPU · 8 GiB", "8 vCPU · 16 GiB"],
  ["Saved snapshots", "3", "50"],
  ["Starts per minute", "120", "120"],
];

export default function Cloud() {
  return (
    <>
      <DocTitle kicker="Run" title="Jasmine Cloud">
        The same sandboxes, on our machines. Same API and SDKs; only <code>JASMINE_URL</code> changes.
      </DocTitle>
      <Prose>
        <h2 id="start">Start</h2>
        <ol>
          <li>Sign in at <a href="/dashboard">tryjasmine.dev/dashboard</a> and create an API key.</li>
          <li>Point your agent or SDK at Cloud:</li>
        </ol>
        <Code>{`
export JASMINE_URL=https://api.tryjasmine.dev
export JASMINE_API_KEY=jsm_…

curl -sX POST $JASMINE_URL/v1/sandboxes -H "authorization: Bearer $JASMINE_API_KEY" \\
  -H 'content-type: application/json' -d '{"timeout": 600}'
`}</Code>
        <p>
          Every account starts with {usd(RATES.trialCredit, 0)} of credit, no card needed. That is about {Math.round(RATES.trialCredit / stdHour())} hours of a{" "}
          {STD.vcpus} vCPU · {STD.gib} GiB sandbox.
        </p>

        <h2 id="billing">Billing</h2>
        <p>
          Per second, from prepaid credit: {usd(RATES.vcpuHour, 4)} per vCPU-hour plus {usd(RATES.gibHour, 4)} per GiB-hour while a sandbox runs, so{" "}
          {usd(stdHour(), 3)} an hour for {STD.vcpus} vCPU · {STD.gib} GiB. A paused sandbox keeps its memory and processes and costs{" "}
          {usd(RATES.storageGibMonth)} per GiB-month of storage; so does a saved snapshot. There is no minimum, no fee per start and no egress charge.
        </p>
        <p>
          Top up {RATES.topUps.map((a) => usd(a, 0)).join(", ")} from the dashboard. Credit never expires. At $0, new sandboxes are refused and running
          ones are paused (nothing is deleted); top up and resume them. You can never owe more than you paid.
        </p>

        <h2 id="timeouts">Timeouts</h2>
        <p>
          A forgotten sandbox shouldn&apos;t burn credit, so every sandbox has a timeout: one hour unless you pass <code>timeout</code> in seconds (up to
          86,400). When it expires the sandbox is deleted, or paused if you passed <code>&quot;on_timeout&quot;: &quot;pause&quot;</code>. The response
          includes <code>timeout_at</code>.
        </p>

        <h2 id="limits">Limits</h2>
        <table>
          <thead>
            <tr>
              <th>Limit</th>
              <th>Trial</th>
              <th>After a top-up</th>
            </tr>
          </thead>
          <tbody>
            {limits.map(([k, a, b]) => (
              <tr key={k}>
                <td>{k}</td>
                <td>{a}</td>
                <td>{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          <code>GET /v1/me</code> returns your balance, limits and this month&apos;s usage. Need more? Email us.
        </p>

        <h2 id="differences">Differences from self-hosted</h2>
        <ul>
          <li>Templates: start from the built-in ones (<code>default</code>: Python 3.12, <code>node</code>: Node 22). Building from your own image isn&apos;t available on shared hosts yet; snapshot a configured sandbox instead and create from the snapshot.</li>
          <li>Preview URLs (<code>/v1/sandboxes/&lt;id&gt;/ports/&lt;port&gt;/</code>) open in a browser without a key; the sandbox ID is the secret. Visiting a preview never wakes a paused sandbox.</li>
          <li>Outbound port 25 (SMTP) is blocked.</li>
        </ul>
        <Callout>
          The engine is the same open-source binary either way. To move off Cloud, run <a href="/docs/self-hosting">jasmined</a> yourself and change{" "}
          <code>JASMINE_URL</code>.
        </Callout>
      </Prose>
    </>
  );
}
