import type { Metadata } from "next";
import { Code } from "@/components/docs/kit";
import { Prose, DocTitle } from "@/components/docs/prose";

export const metadata: Metadata = { title: "Sandbox HTTP API reference · Jasmine", description: "Every Jasmine HTTP endpoint: create, exec, files, pause, resume, snapshot, previews, S3 mounts and templates.", alternates: { canonical: "/docs/api/" } };

const routes: [string, string, string][] = [
  ["POST", "/v1/sandboxes", "Create. Body (all optional): template, env, labels, key, cpu, memory_mib. 201 with id and timings."],
  ["GET", "/v1/sandboxes", "List. Filter with ?key= and ?label.name=value."],
  ["GET", "/v1/sandboxes/{id}", "One sandbox, with state running or paused."],
  ["DELETE", "/v1/sandboxes/{id}", "Delete."],
  ["POST", "/v1/sandboxes/{id}/exec", "Run a command. Body: cmd (string or array), env, cwd, timeout_ms, stdin."],
  ["GET", "/v1/sandboxes/{id}/files?path=", "Read a file. Raw bytes."],
  ["PUT", "/v1/sandboxes/{id}/files?path=&mode=", "Write a file. Raw bytes in the body; mode in octal."],
  ["POST", "/v1/sandboxes/{id}/pause", "Pause. 204."],
  ["POST", "/v1/sandboxes/{id}/resume", "Resume. Any other call also resumes."],
  ["POST", "/v1/sandboxes/{id}/snapshot", "Save as a new template. 201 with the template."],
  ["ANY", "/v1/sandboxes/{id}/ports/{port}/{path}", "Preview: proxies to a port inside the sandbox, WebSocket upgrades included."],
  ["POST", "/v1/sandboxes/{id}/mounts", "Mount an S3 bucket. Body: bucket, path, prefix, endpoint, region, access_key_id, secret_access_key, session_token, read_only. 201 with path."],
  ["DELETE", "/v1/sandboxes/{id}/mounts?path=", "Unmount. 204."],
  ["GET", "/v1/templates", "List templates."],
  ["POST", "/v1/templates", "Build. Body: name, image, vcpus (2), mem_mib (1024), prewarm_mib (256), setup, start, ready_port."],
  ["GET / DELETE", "/v1/templates/{name}", "Get or delete a template."],
  ["GET", "/healthz", "Liveness. Never needs auth."],
];

export default function Api() {
  return (
    <>
      <DocTitle kicker="Build" title="HTTP API">
        JSON over HTTP on port 7171, except file bodies, which are raw bytes. If the daemon has an API key, send it as a bearer token on every /v1 request.
      </DocTitle>
      <Prose>
        <Code>{`
export JASMINE_URL=http://127.0.0.1:7171
export AUTH="authorization: Bearer $JASMINE_API_KEY"

ID=$(curl -fsS -X POST $JASMINE_URL/v1/sandboxes -H "$AUTH" | jq -r .id)
curl -fsS -X POST $JASMINE_URL/v1/sandboxes/$ID/exec -H "$AUTH" \\
  -H 'content-type: application/json' -d '{"cmd":"uname -a"}'
curl -fsS -X PUT "$JASMINE_URL/v1/sandboxes/$ID/files?path=/tmp/a.txt" -H "$AUTH" --data-binary 'hello'
curl -fsS -X DELETE $JASMINE_URL/v1/sandboxes/$ID -H "$AUTH"
`}</Code>
        <h2 id="routes">Routes</h2>
        <table>
          <thead><tr><th>Method</th><th>Path</th><th>Notes</th></tr></thead>
          <tbody>
            {routes.map(([m, p, d]) => (
              <tr key={m + p}><td className="font-mono text-xs text-[var(--leaf)]">{m}</td><td><code>{p}</code></td><td>{d}</td></tr>
            ))}
          </tbody>
        </table>
        <h2 id="exec">Exec response</h2>
        <Code lang="json">{`
{
  "exit_code": 0, "signal": null, "timed_out": false,
  "stdout": "42\\n", "stderr": "", "truncated": false,
  "duration_ms": 4.1
}
`}</Code>
        <h2 id="errors">Errors</h2>
        <p>
          Errors are <code>{`{"error": "message"}`}</code> with a matching status: 401 for a missing or wrong key, 404 for an unknown sandbox or
          template, 409 when a name already exists, and 502 when a preview port has nothing listening.
        </p>
        <h2 id="sizes">Machine sizes</h2>
        <p>
          Pass both <code>cpu</code> and <code>memory_mib</code> on create to get a sandbox of that size. Jasmine looks for a template named
          <code>{"{template}-{cpu}x{memory_mib}"}</code> (for example <code>default-4x8192</code>), or uses the template itself if it was built at
          that size. If neither exists, the error tells you the exact <code>jasmined build</code> command to run.
        </p>
      </Prose>
    </>
  );
}
