"""Jasmine Python SDK. Standard library only.

    from jasmine_sdk import Jasmine

    jasmine = Jasmine()  # $JASMINE_URL / $JASMINE_API_KEY, default http://127.0.0.1:7171
    with jasmine.create() as sbx:
        r = sbx.exec("python3 -c 'print(6*7)'")
        print(r.stdout)  # "42\\n"
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Optional, Sequence, Union

__all__ = ["Jasmine", "Sandbox", "ExecResult", "JasmineError"]
__version__ = "0.1.0"


class JasmineError(Exception):
    def __init__(self, message: str, status: int):
        super().__init__(message)
        self.status = status


@dataclass
class ExecResult:
    exit_code: Optional[int]
    signal: Optional[int]
    timed_out: bool
    stdout: str
    stderr: str
    truncated: bool
    duration_ms: float

    @property
    def ok(self) -> bool:
        return self.exit_code == 0


class Jasmine:
    def __init__(self, url: Optional[str] = None, api_key: Optional[str] = None, timeout: float = 300.0):
        self.url = (url or os.environ.get("JASMINE_URL") or "http://127.0.0.1:7171").rstrip("/")
        self.api_key = api_key or os.environ.get("JASMINE_API_KEY")
        self.timeout = timeout

    def _request(self, method: str, path: str, body: Any = None, raw: bool = False) -> Any:
        headers = {}
        data = None
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        if isinstance(body, (bytes, bytearray)):
            data = bytes(body)
        elif body is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(body).encode()
        req = urllib.request.Request(self.url + path, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as res:
                payload = res.read()
                if res.status == 204:
                    return None
                return payload if raw else json.loads(payload)
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors="replace")
            try:
                msg = json.loads(msg).get("error", msg)
            except ValueError:
                pass
            raise JasmineError(f"{method} {path}: {msg}", e.code) from None

    def create(self, template: str = "default") -> "Sandbox":
        r = self._request("POST", "/v1/sandboxes", {"template": template})
        return Sandbox(self, r["id"], r["template"], r.get("timings"))

    def get(self, sandbox_id: str) -> "Sandbox":
        r = self._request("GET", f"/v1/sandboxes/{urllib.parse.quote(sandbox_id)}")
        return Sandbox(self, r["id"], r["template"])

    def list(self) -> list:
        return self._request("GET", "/v1/sandboxes")

    def templates(self) -> list:
        return self._request("GET", "/v1/templates")

    def build_template(
        self, name: str, image: str, vcpus: int = 2, mem_mib: int = 1024, prewarm_mib: int = 256,
        setup: Optional[str] = None, start: Optional[str] = None, ready_port: Optional[int] = None,
    ) -> dict:
        """Build a template from an OCI image. `setup` runs once before the snapshot; `start` is left
        running in it (every sandbox starts with it up), and the build waits for `ready_port`."""
        body = {"name": name, "image": image, "vcpus": vcpus, "mem_mib": mem_mib, "prewarm_mib": prewarm_mib}
        body.update({k: v for k, v in (("setup", setup), ("start", start), ("ready_port", ready_port)) if v is not None})
        return self._request("POST", "/v1/templates", body)


@dataclass
class Sandbox:
    client: Jasmine
    id: str
    template: str
    timings: Optional[dict] = field(default=None, repr=False)

    @property
    def _base(self) -> str:
        return f"/v1/sandboxes/{urllib.parse.quote(self.id)}"

    def exec(
        self,
        cmd: Union[str, Sequence[str]],
        env: Optional[dict] = None,
        cwd: Optional[str] = None,
        timeout_ms: Optional[int] = None,
        stdin: Optional[str] = None,
    ) -> ExecResult:
        """Run a command. A string runs through /bin/sh -c; a list is exec'd directly."""
        r = self.client._request(
            "POST", f"{self._base}/exec",
            {"cmd": cmd if isinstance(cmd, str) else list(cmd), "env": env or {}, "cwd": cwd,
             "timeout_ms": timeout_ms, "stdin": stdin},
        )
        return ExecResult(r["exit_code"], r["signal"], r["timed_out"], r["stdout"], r["stderr"],
                          r["truncated"], r["duration_ms"])

    def read_file(self, path: str) -> bytes:
        return self.client._request("GET", f"{self._base}/files?path={urllib.parse.quote(path)}", raw=True)

    def write_file(self, path: str, data: Union[str, bytes], mode: Optional[int] = None) -> None:
        q = f"path={urllib.parse.quote(path)}" + (f"&mode={mode:o}" if mode is not None else "")
        self.client._request("PUT", f"{self._base}/files?{q}", data.encode() if isinstance(data, str) else data)

    def pause(self) -> None:
        """Suspend to disk, keeping memory and running processes. Any later call resumes it."""
        self.client._request("POST", f"{self._base}/pause")

    def resume(self) -> None:
        self.client._request("POST", f"{self._base}/resume")

    def snapshot(self) -> dict:
        """Snapshot this sandbox into a new template; Jasmine().create(template=t["name"]) starts copies."""
        return self.client._request("POST", f"{self._base}/snapshot")

    def preview_url(self, port: int, path: str = "/") -> str:
        """URL that proxies to `port` inside the sandbox."""
        return f"{self.client.url}{self._base}/ports/{port}{path if path.startswith('/') else '/' + path}"

    def cdp_url(self, port: int = 9222) -> str:
        """WebSocket URL for the Chrome DevTools Protocol of a browser running in this sandbox (the
        `browser` template has one on port 9222). Use it with Playwright's
        `chromium.connect_over_cdp(url)`."""
        v = self.client._request("GET", f"{self._base}/ports/{port}/json/version")
        path = urllib.parse.urlparse(v["webSocketDebuggerUrl"]).path
        return "ws" + self.preview_url(port, path)[len("http"):]

    def delete(self) -> None:
        try:
            self.client._request("DELETE", self._base)
        except JasmineError as e:
            if e.status != 404:
                raise

    def __enter__(self) -> "Sandbox":
        return self

    def __exit__(self, *exc) -> None:
        self.delete()
