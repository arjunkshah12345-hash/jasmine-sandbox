// Outbound IPv6 from a sandbox, and the host still unreachable over it.
// CI runners have no IPv6 internet, so .github/workflows/e2e.yml routes a stand-in
// "internet" namespace (2001:db8:6a73::2) through the host before running this.
import { Jasmine } from "./typescript/dist/index.js";

const OUTSIDE = process.env.IPV6_OUTSIDE ?? "http://[2001:db8:6a73::2]:8080/index.html";
const HOST = process.env.IPV6_HOST ?? "http://[2001:db8:6a73::1]:8081/";
const fetchPy = (url) => `python3 -c "import urllib.request,sys; print(urllib.request.urlopen(sys.argv[1], timeout=3).read().decode().strip())" '${url}'`;

const sbx = await new Jasmine().create();
try {
  const addr = await sbx.exec(`python3 -c "import socket; s=socket.socket(socket.AF_INET6, socket.SOCK_DGRAM); s.connect(('2001:db8:6a73::2', 9)); print(s.getsockname()[0])"`);
  if (addr.stdout.trim() !== "fd00:6a73::2") throw new Error(`guest has no IPv6 route: ${JSON.stringify(addr)}`);
  const out = await sbx.exec(fetchPy(OUTSIDE));
  if (out.stdout.trim() !== "v6-ok") throw new Error(`outbound IPv6 failed: ${JSON.stringify(out)}`);
  const host = await sbx.exec(fetchPy(HOST));
  if (host.exitCode === 0) throw new Error(`sandbox reached the host over IPv6: ${JSON.stringify(host)}`);
  console.log(JSON.stringify({ ok: true, guest: addr.stdout.trim(), outbound: "v6-ok", host_blocked: true }));
} finally {
  await sbx.delete();
}
