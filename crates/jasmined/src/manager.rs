use crate::agent::AgentClient;
use crate::fc::{clone_file, merge_sparse, Vm, ROOTFS};
use crate::net::{NetPool, Slot};
use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::sync::Mutex;

pub struct Config {
    pub data: PathBuf,
    pub firecracker: PathBuf,
    pub kernel: PathBuf,
    pub agent_bin: PathBuf,
    /// Run VMMs unprivileged: network slot k's VMM runs as uid/gid `base + k + 1`, and
    /// templates are readable through group `base`. None runs VMMs as root.
    pub vm_uid_base: Option<u32>,
    /// Static rclone binary, copied into a sandbox the first time it mounts a bucket.
    pub rclone_bin: PathBuf,
}

/// An S3 (or S3-compatible) bucket to mount inside a sandbox.
#[derive(Debug, Clone, Deserialize)]
pub struct S3Mount {
    pub bucket: String,
    /// Where it appears in the sandbox. Default `/mnt/<bucket>`.
    #[serde(default)]
    pub path: Option<String>,
    /// Mount only this key prefix ("folder") of the bucket.
    #[serde(default)]
    pub prefix: Option<String>,
    /// For S3-compatible stores (R2, MinIO, GCS, Tigris, ...). Default: AWS S3.
    #[serde(default)]
    pub endpoint: Option<String>,
    #[serde(default)]
    pub region: Option<String>,
    /// No keys means anonymous access (public buckets).
    #[serde(default)]
    pub access_key_id: Option<String>,
    #[serde(default)]
    pub secret_access_key: Option<String>,
    #[serde(default)]
    pub session_token: Option<String>,
    #[serde(default)]
    pub read_only: bool,
}

const AGENT_IN_GUEST: &str = "/.jasmine/agent";
const RCLONE_IN_GUEST: &str = "/.jasmine/rclone";
/// Links that make the agent act as libfuse's mount helper (see crates/agent/src/fuse.rs).
const FUSERMOUNT_LINKS: &str = "for n in fusermount3 fusermount; do command -v $n >/dev/null 2>&1 || ln -sf /.jasmine/agent /usr/local/bin/$n; done";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateMeta {
    pub name: String,
    pub image: String,
    pub vcpus: u32,
    pub mem_mib: u32,
    #[serde(default)]
    pub prewarm_mib: u32,
    pub rootfs_bytes: u64,
    pub boot_ms: u64,
    pub built_unix: u64,
    /// For snapshots: the sandbox it was taken from.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_sandbox: Option<String>,
    /// Command started in the background before the snapshot, so it is already
    /// running in every sandbox (e.g. a headless browser).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start: Option<String>,
    /// Port the start command listens on; the snapshot waits until it accepts connections.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ready_port: Option<u16>,
}

/// Optional build steps beyond "boot the image".
#[derive(Debug, Clone, Default, Deserialize)]
pub struct BuildOpts {
    /// Shell command run once, to completion, before the snapshot (e.g. `apt-get install -y chromium`).
    #[serde(default)]
    pub setup: Option<String>,
    /// Shell command started in the background before the snapshot. It is captured
    /// running, so it is already up the moment a sandbox is created.
    #[serde(default)]
    pub start: Option<String>,
    /// TCP port inside the guest that `start` listens on. The build waits for it.
    #[serde(default)]
    pub ready_port: Option<u16>,
}

/// How long a template build waits for `setup` to finish and for `ready_port` to open.
const SETUP_TIMEOUT: Duration = Duration::from_secs(900);
const READY_TIMEOUT: Duration = Duration::from_secs(120);

#[derive(Debug, Clone, Serialize)]
pub struct CreateTimings {
    pub clone_disk_ms: f64,
    pub reflink: bool,
    pub spawn_vmm_ms: f64,
    pub restore_ms: f64,
    pub agent_ready_ms: f64,
    pub total_ms: f64,
    /// VMM start-up attempts this create needed (1 = no retry).
    pub attempts: u32,
}

pub struct Sandbox {
    pub id: String,
    pub template: String,
    pub created_unix: u64,
    pub vcpus: u32,
    pub mem_mib: u32,
    pub key: Option<String>,
    pub labels: BTreeMap<String, String>,
    /// Default environment for every exec in this sandbox.
    pub env: BTreeMap<String, String>,
    pub agent: AgentClient,
    vm: Mutex<Option<(Vm, Slot)>>,
    dir: PathBuf,
    /// Memory file that, plus the pages dirtied since, equals current guest memory.
    base_mem: std::sync::Mutex<PathBuf>,
}

#[derive(Serialize)]
pub struct SandboxInfo {
    pub id: String,
    pub template: String,
    pub created_unix: u64,
    pub vcpus: u32,
    pub mem_mib: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key: Option<String>,
    pub labels: BTreeMap<String, String>,
}

#[derive(Default, Deserialize)]
pub struct CreateOpts {
    #[serde(default)]
    pub key: Option<String>,
    #[serde(default)]
    pub labels: BTreeMap<String, String>,
    #[serde(default)]
    pub env: BTreeMap<String, String>,
    /// Requested machine size; resolved to a template built at that size.
    #[serde(default)]
    pub cpu: Option<u32>,
    #[serde(default)]
    pub memory_mib: Option<u32>,
}

impl Sandbox {
    pub fn info(&self) -> SandboxInfo {
        SandboxInfo {
            id: self.id.clone(),
            template: self.template.clone(),
            created_unix: self.created_unix,
            vcpus: self.vcpus,
            mem_mib: self.mem_mib,
            key: self.key.clone(),
            labels: self.labels.clone(),
        }
    }
}

pub struct Manager {
    pub cfg: Config,
    net: Arc<NetPool>,
    sandboxes: Mutex<HashMap<String, Arc<Sandbox>>>,
}

fn ms(d: Duration) -> f64 {
    (d.as_secs_f64() * 1e6).round() / 1e3
}

fn now_ns() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos() as u64
}

pub fn random_bytes(n: usize) -> Vec<u8> {
    let mut b = vec![0u8; n];
    std::fs::File::open("/dev/urandom").and_then(|mut f| f.read_exact(&mut b)).expect("read /dev/urandom");
    b
}

fn valid_name(s: &str) -> bool {
    !s.is_empty() && s.len() <= 64 && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

async fn run(cmd: &str) -> Result<()> {
    let out = tokio::process::Command::new("sh").arg("-c").arg(cmd).output().await?;
    if !out.status.success() {
        bail!("`{cmd}` failed: {}", String::from_utf8_lossy(&out.stderr));
    }
    Ok(())
}

fn shell_quote(p: &Path) -> String {
    format!("'{}'", p.display().to_string().replace('\'', r"'\''"))
}

impl Manager {
    /// (uid, shared template group) for the VMM in `slot`, when VMMs run unprivileged.
    fn vm_uid(&self, slot: &Slot) -> Option<(u32, u32)> {
        self.cfg.vm_uid_base.map(|b| (b + slot.0 + 1, b))
    }

    /// `owns_sandboxes`: true for the server, which clears sandboxes left by a
    /// previous run (they do not survive restarts). False for one-shot CLI use.
    pub async fn new(cfg: Config, owns_sandboxes: bool, net_pool: usize) -> Result<Arc<Self>> {
        std::fs::create_dir_all(cfg.data.join("templates"))?;
        let sbx = cfg.data.join("sandboxes");
        if owns_sandboxes {
            let _ = std::fs::remove_dir_all(&sbx);
        }
        std::fs::create_dir_all(&sbx)?;
        if let Some(gid) = cfg.vm_uid_base {
            // Templates built as root (e.g. by `jasmined build`) must be readable by
            // unprivileged VMMs; snapshots of sandboxes stay group-only.
            for e in std::fs::read_dir(cfg.data.join("templates"))?.flatten() {
                let public = !e.file_name().to_string_lossy().starts_with("snap_");
                crate::fc::seal(&e.path(), gid, public).with_context(|| format!("seal template {}", e.path().display()))?;
            }
        }
        let net = NetPool::new(net_pool, owns_sandboxes, cfg.vm_uid_base).await?;
        Ok(Arc::new(Manager { cfg, net, sandboxes: Mutex::new(HashMap::new()) }))
    }

    fn template_dir(&self, name: &str) -> PathBuf {
        self.cfg.data.join("templates").join(name)
    }

    pub fn templates(&self) -> Vec<TemplateMeta> {
        let mut out = Vec::new();
        if let Ok(rd) = std::fs::read_dir(self.cfg.data.join("templates")) {
            for e in rd.flatten() {
                if let Ok(s) = std::fs::read(e.path().join("meta.json")) {
                    if let Ok(m) = serde_json::from_slice(&s) {
                        out.push(m);
                    }
                }
            }
        }
        out.sort_by(|a: &TemplateMeta, b| a.name.cmp(&b.name));
        out
    }

    /// OCI image → ext4 rootfs → cold boot → snapshot. Requires root and `crane`.
    pub async fn build_template(&self, name: &str, image: &str, vcpus: u32, mem_mib: u32, prewarm_mib: u32, opts: BuildOpts) -> Result<TemplateMeta> {
        if !valid_name(name) {
            bail!("invalid template name");
        }
        if opts.ready_port.is_some() && opts.start.is_none() {
            bail!("ready_port needs a start command");
        }
        let dir = self.template_dir(name);
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir)?;
        let tree = dir.join("rootfs.d");
        std::fs::create_dir_all(&tree)?;
        let image_q = format!("'{}'", image.replace('\'', ""));
        run(&format!("crane export --platform linux/{} {image_q} - | tar -x -C {}", go_arch(), shell_quote(&tree)))
            .await
            .context("export image")?;
        std::fs::create_dir_all(tree.join(".jasmine"))?;
        std::fs::copy(&self.cfg.agent_bin, tree.join(".jasmine/agent")).context("install agent")?;
        // FUSE mount helper for images without libfuse's (S3 mounts, sshfs, ...).
        std::fs::create_dir_all(tree.join("usr/local/bin"))?;
        for n in ["fusermount3", "fusermount"] {
            let link = tree.join("usr/local/bin").join(n);
            if std::fs::symlink_metadata(&link).is_err() && !tree.join("usr/bin").join(n).exists() && !tree.join("bin").join(n).exists() {
                std::os::unix::fs::symlink(AGENT_IN_GUEST, &link)?;
            }
        }
        std::fs::create_dir_all(tree.join("root"))?;
        std::fs::create_dir_all(tree.join("workspace"))?;
        std::fs::create_dir_all(tree.join("etc"))?;
        let _ = std::fs::remove_file(tree.join("etc/resolv.conf"));
        std::fs::write(tree.join("etc/resolv.conf"), "nameserver 1.1.1.1\nnameserver 8.8.8.8\n")?;
        std::fs::write(tree.join("etc/hostname"), "jasmine\n")?;
        // Images rarely ship /etc/hosts (Docker injects one at run time). Without it,
        // localhost lookups go to DNS, and tools like `python -m http.server` stall.
        std::fs::write(tree.join("etc/hosts"), "127.0.0.1\tlocalhost jasmine\n::1\tlocalhost ip6-localhost ip6-loopback\n")?;

        let used: u64 = {
            let out = tokio::process::Command::new("du").args(["-sb"]).arg(&tree).output().await?;
            String::from_utf8_lossy(&out.stdout).split_whitespace().next().unwrap_or("0").parse().unwrap_or(0)
        };
        // Sparse file: unused space costs nothing on disk, and reflink clones share the rest.
        let size_mib = ((used as f64 * 1.2) as u64 / (1 << 20) + 4096).max(10240);
        let rootfs = dir.join(ROOTFS);
        run(&format!(
            // No journal: sandbox disks are ephemeral (running sandboxes don't survive a
            // daemon restart, and paused ones are synced before their snapshot), so the
            // journal buys no crash safety but doubles metadata writes and slows fsync.
            "truncate -s {size_mib}M {r} && mkfs.ext4 -q -F -L jasmine -O ^has_journal -E root_owner=0:0 -d {t} {r}",
            r = shell_quote(&rootfs),
            t = shell_quote(&tree)
        ))
        .await
        .context("mkfs.ext4")?;
        std::fs::remove_dir_all(&tree)?;

        let slot = self.net.acquire().await?;
        let t0 = Instant::now();
        let vm = match Vm::spawn(&self.cfg.firecracker, &dir, Some(&slot.netns_path()), self.vm_uid(&slot)).await {
            Ok(vm) => vm,
            Err(e) => {
                self.net.destroy(slot).await;
                return Err(e);
            }
        };
        let res: Result<u64> = async {
            vm.boot(&self.cfg.kernel, vcpus, mem_mib).await?;
            let agent = AgentClient::new(&dir);
            agent.wait_ready(Duration::from_secs(30)).await.with_context(|| format!("console: {}", vm.console_tail()))?;
            let boot_ms = t0.elapsed().as_millis() as u64;
            let sh = |script: String, timeout: Duration| jasmine_proto::ExecRequest {
                argv: vec!["/bin/sh".into(), "-c".into(), script],
                timeout_ms: Some(timeout.as_millis() as u64),
                ..Default::default()
            };
            if let Some(setup) = &opts.setup {
                let out = agent.exec(sh(setup.clone(), SETUP_TIMEOUT), None).await?;
                if out.exit_code != Some(0) {
                    let why = if out.timed_out { "timed out".to_string() } else { format!("exit {:?}, signal {:?}", out.exit_code, out.signal) };
                    bail!("setup failed ({why}):\n{}{}", tail(&out.stdout), tail(&out.stderr));
                }
            }
            if let Some(start) = &opts.start {
                // Detached in its own session with its output in a log, so it outlives this exec
                // and is captured running by the snapshot.
                let script = format!("cd /root 2>/dev/null || cd /; setsid sh -c {} </dev/null >/var/log/jasmine-start.log 2>&1 &", shell_quote_str(start));
                let out = agent.exec(sh(script, Duration::from_secs(30)), None).await?;
                if out.exit_code != Some(0) {
                    bail!("start failed (exit {:?}): {}", out.exit_code, out.stderr.trim());
                }
            }
            if let Some(port) = opts.ready_port {
                let t = Instant::now();
                loop {
                    if agent.connect_port(port).await.is_ok() {
                        break;
                    }
                    if t.elapsed() > READY_TIMEOUT {
                        let log = agent.read_file("/var/log/jasmine-start.log").await.unwrap_or_default();
                        bail!("nothing listening on port {port} after {}s; start log:\n{}", READY_TIMEOUT.as_secs(), tail(&String::from_utf8_lossy(&log)));
                    }
                    tokio::time::sleep(Duration::from_millis(250)).await;
                }
                tracing::info!(template = name, port, "start command ready in {:.1}s", t.elapsed().as_secs_f64());
            }
            if prewarm_mib > 0 {
                let out = agent
                    .exec(
                        jasmine_proto::ExecRequest {
                            argv: vec!["/bin/sh".into(), "-c".into(), PREWARM.into(), "prewarm".into(), prewarm_mib.to_string()],
                            timeout_ms: Some(60_000),
                            ..Default::default()
                        },
                        None,
                    )
                    .await?;
                tracing::info!(template = name, "prewarm: {}", out.stdout.trim());
            }
            agent.sync().await?;
            vm.pause().await?;
            vm.snapshot(&dir.join("vm.snap"), &dir.join("mem.snap")).await?;
            Ok(boot_ms)
        }
        .await;
        vm.kill().await;
        self.net.destroy(slot).await;
        let boot_ms = res?;
        if let Some(gid) = self.cfg.vm_uid_base {
            crate::fc::seal(&dir, gid, true).context("make template readable to VMMs")?;
        }
        let meta = TemplateMeta {
            name: name.into(),
            image: image.into(),
            vcpus,
            mem_mib,
            prewarm_mib,
            start: opts.start.clone(),
            ready_port: opts.ready_port,
            rootfs_bytes: used,
            boot_ms,
            built_unix: now_ns() / 1_000_000_000,
            source_sandbox: None,
        };
        std::fs::write(dir.join("meta.json"), serde_json::to_vec_pretty(&meta)?)?;
        Ok(meta)
    }

    /// Pick the template for a request: `<template>-<cpu>x<mem>` if a size is
    /// asked for and that exists, else `<template>` if its size matches.
    pub fn resolve_template(&self, template: &str, cpu: Option<u32>, mem: Option<u32>) -> Result<String> {
        if !valid_name(template) {
            bail!("invalid template name");
        }
        let (Some(cpu), Some(mem)) = (cpu, mem) else { return Ok(template.into()) };
        let sized = format!("{template}-{cpu}x{mem}");
        if self.template_dir(&sized).join("meta.json").exists() {
            return Ok(sized);
        }
        let meta: Option<TemplateMeta> =
            std::fs::read(self.template_dir(template).join("meta.json")).ok().and_then(|b| serde_json::from_slice(&b).ok());
        match meta {
            Some(m) if m.vcpus == cpu && m.mem_mib == mem => Ok(template.into()),
            _ => bail!("no template {sized:?} (build one with: jasmined build {sized} <image> --vcpus {cpu} --mem-mib {mem})"),
        }
    }

    pub async fn create(&self, template: &str, opts: CreateOpts) -> Result<(Arc<Sandbox>, CreateTimings)> {
        let template = &self.resolve_template(template, opts.cpu, opts.memory_mib)?;
        if let Some(k) = &opts.key {
            if self.sandboxes.lock().await.values().any(|s| s.key.as_deref() == Some(k)) {
                bail!("a sandbox with key {k:?} already exists");
            }
        }
        let tdir = self.template_dir(template);
        if !tdir.join("meta.json").exists() {
            bail!("template {template:?} not found");
        }
        let id = format!("sbx_{}", random_bytes(8).iter().map(|b| format!("{b:02x}")).collect::<String>());
        let dir = self.cfg.data.join("sandboxes").join(&id);
        std::fs::create_dir_all(&dir)?;

        // A VMM can die during start-up for host reasons outside our control (e.g.
        // KVM_EXIT_FAIL_ENTRY under nested virtualization). Retry with a fresh VMM
        // and slot rather than failing the user's create; every retry is logged.
        let mut attempt = 1u32;
        let (vm, slot, mut timings) = loop {
            match self.restore_into(&dir, &tdir.join(ROOTFS), &tdir.join("vm.snap"), &tdir.join("mem.snap")).await {
                Ok(v) => break v,
                Err(e) if attempt < 3 && format!("{e:#}").contains("vmm exited: Some(") => {
                    tracing::warn!(sandbox = %id, attempt, "VMM died during start-up, retrying: {e:#}");
                    attempt += 1;
                }
                Err(e) => {
                    let _ = std::fs::remove_dir_all(&dir);
                    return Err(e);
                }
            }
        };
        timings.attempts = attempt;
        let size: Option<TemplateMeta> = std::fs::read(tdir.join("meta.json")).ok().and_then(|b| serde_json::from_slice(&b).ok());
        let sbx = Arc::new(Sandbox {
            id: id.clone(),
            template: template.into(),
            created_unix: now_ns() / 1_000_000_000,
            vcpus: size.as_ref().map_or(0, |m| m.vcpus),
            mem_mib: size.as_ref().map_or(0, |m| m.mem_mib),
            key: opts.key,
            labels: opts.labels,
            env: opts.env,
            agent: AgentClient::new(&dir),
            vm: Mutex::new(Some((vm, slot))),
            dir,
            base_mem: std::sync::Mutex::new(tdir.join("mem.snap")),
        });
        self.sandboxes.lock().await.insert(id, sbx.clone());
        Ok((sbx, timings))
    }

    /// Clone `rootfs` into `dir` (unless it is already there), start a VMM in a
    /// network slot and restore `vmstate` + `mem` into it. Shared by create,
    /// create-from-snapshot and resume.
    async fn restore_into(&self, dir: &Path, rootfs: &Path, vmstate: &Path, mem: &Path) -> Result<(Vm, Slot, CreateTimings)> {
        let t0 = Instant::now();
        // Filesystem syscalls block; keep them off the async workers so concurrent
        // creates don't serialize behind each other.
        let reflink = if rootfs == dir.join(ROOTFS) {
            true
        } else {
            let (src, dst) = (rootfs.to_path_buf(), dir.join(ROOTFS));
            tokio::task::spawn_blocking(move || clone_file(&src, &dst)).await??
        };
        let slot = self.net.acquire().await?;
        let result: Result<(Vm, CreateTimings)> = async {
            let t1 = Instant::now();
            let vm = Vm::spawn(&self.cfg.firecracker, dir, Some(&slot.netns_path()), self.vm_uid(&slot)).await?;
            let t2 = Instant::now();
            if let Err(e) = vm.restore(vmstate, mem).await {
                vm.kill().await;
                return Err(e);
            }
            let t3 = Instant::now();
            // Fresh clock and entropy: every restore of a snapshot must diverge.
            // Right after restore the guest must first process a vsock transport
            // reset; under load the first connection can be refused or reset, so
            // retry briefly instead of failing the create.
            let agent = AgentClient::new(dir);
            let deadline = Instant::now() + Duration::from_secs(3);
            let mut backoff = Duration::from_millis(1);
            loop {
                match agent.ping(Some(now_ns()), Some(random_bytes(64))).await {
                    Ok(_) => break,
                    Err(e) if Instant::now() < deadline => {
                        tracing::debug!("post-restore ping retry: {e:#}");
                        tokio::time::sleep(backoff).await;
                        backoff = (backoff * 2).min(Duration::from_millis(50));
                    }
                    Err(e) => {
                        let mut vm = vm;
                        let exited = vm.child.try_wait().ok().flatten();
                        let console = vm.console_tail();
                        vm.kill().await;
                        return Err(e.context(format!(
                            "agent not ready after restore; vmm exited: {exited:?}; console: {}",
                            console
                        )));
                    }
                }
            }
            let t4 = Instant::now();
            Ok((
                vm,
                CreateTimings {
                    clone_disk_ms: ms(t1 - t0),
                    reflink,
                    spawn_vmm_ms: ms(t2 - t1),
                    restore_ms: ms(t3 - t2),
                    agent_ready_ms: ms(t4 - t3),
                    total_ms: ms(t4 - t0),
                    attempts: 1,
                },
            ))
        }
        .await;
        match result {
            Ok((vm, t)) => Ok((vm, slot, t)),
            Err(e) => {
                self.net.release(slot).await;
                Err(e)
            }
        }
    }

    /// Write `vm`'s state (paused) to `vmstate` + `mem`. If the base memory file
    /// still exists, write only dirty pages and merge them onto a copy-on-write
    /// clone of the base; otherwise fall back to a full snapshot.
    async fn write_state(&self, sbx: &Sandbox, vm: &Vm, vmstate: &Path, mem: &Path) -> Result<()> {
        let base = sbx.base_mem.lock().unwrap().clone();
        if base.exists() {
            let diff = mem.with_extension("diff");
            vm.snapshot_diff(vmstate, &diff).await?;
            let diff_alloc = std::fs::metadata(&diff).map(|m| { use std::os::unix::fs::MetadataExt; m.blocks() * 512 }).unwrap_or(0);
            let (b, mm, dd) = (base.clone(), mem.to_path_buf(), diff.clone());
            let r = tokio::task::spawn_blocking(move || clone_file(&b, &mm).and_then(|_| merge_sparse(&dd, &mm))).await?;
            tracing::info!(sandbox = %sbx.id, base = %base.display(), diff_alloc, merged = ?r.as_ref().ok(), "diff snapshot");
            let _ = std::fs::remove_file(&diff);
            if r.is_ok() {
                return Ok(());
            }
            tracing::warn!("diff snapshot merge failed, taking a full snapshot: {:#}", r.unwrap_err());
        }
        vm.snapshot(vmstate, mem).await
    }

    /// After writing a snapshot, make (a reflink of) it the sandbox's new base,
    /// since Firecracker resets dirty tracking on every snapshot.
    fn rebase(&self, sbx: &Sandbox, mem: &Path) -> Result<()> {
        let base = sbx.dir.join("base.mem");
        let tmp = sbx.dir.join("base.mem.tmp");
        if mem != tmp.as_path() {
            clone_file(mem, &tmp)?;
        }
        std::fs::rename(&tmp, &base)?; // the VMM keeps the old file mapped
        *sbx.base_mem.lock().unwrap() = base;
        Ok(())
    }

    /// Snapshot a running sandbox (memory, CPU state and disk) into a new
    /// template that any number of sandboxes can be created from. The source
    /// keeps running; it is paused only while state is written.
    pub async fn snapshot(&self, id: &str) -> Result<TemplateMeta> {
        let sbx = self.get(id).await.ok_or_else(|| anyhow::anyhow!("sandbox not found"))?;
        self.ensure_running(&sbx).await?;
        let name = format!("snap_{}", random_bytes(6).iter().map(|b| format!("{b:02x}")).collect::<String>());
        let dst = self.template_dir(&name);
        std::fs::create_dir_all(&dst)?;
        let guard = sbx.vm.lock().await;
        let (vm, _) = guard.as_ref().ok_or_else(|| anyhow::anyhow!("sandbox is paused"))?;
        if let Some(u) = vm.uid {
            crate::fc::own(&dst, u, u)?; // the VMM writes the snapshot files itself
        }
        let res: Result<()> = async {
            sbx.agent.sync().await?;
            vm.pause().await?;
            let r = async {
                self.write_state(&sbx, vm, &dst.join("vm.snap"), &dst.join("mem.snap")).await?;
                self.rebase(&sbx, &dst.join("mem.snap"))?;
                clone_file(&sbx.dir.join(ROOTFS), &dst.join(ROOTFS))?;
                Ok::<_, anyhow::Error>(())
            }
            .await;
            vm.resume().await?;
            r
        }
        .await;
        drop(guard);
        if let Err(e) = res {
            let _ = std::fs::remove_dir_all(&dst);
            return Err(e);
        }
        if let Some(gid) = self.cfg.vm_uid_base {
            crate::fc::seal(&dst, gid, false).context("seal snapshot")?;
        }
        let base: TemplateMeta = serde_json::from_slice(&std::fs::read(self.template_dir(&sbx.template).join("meta.json"))?)?;
        let meta = TemplateMeta {
            name,
            image: format!("snapshot of {id} ({})", base.image),
            built_unix: now_ns() / 1_000_000_000,
            boot_ms: 0,
            source_sandbox: Some(id.to_string()),
            ..base
        };
        std::fs::write(dst.join("meta.json"), serde_json::to_vec_pretty(&meta)?)?;
        Ok(meta)
    }

    pub fn template(&self, name: &str) -> Option<TemplateMeta> {
        if !valid_name(name) {
            return None;
        }
        std::fs::read(self.template_dir(name).join("meta.json")).ok().and_then(|b| serde_json::from_slice(&b).ok())
    }

    pub async fn delete_template(&self, name: &str) -> Result<bool> {
        if !valid_name(name) {
            bail!("invalid template name");
        }
        let dir = self.template_dir(name);
        if !dir.exists() {
            return Ok(false);
        }
        tokio::fs::remove_dir_all(dir).await?;
        Ok(true)
    }

    /// Suspend to disk: write memory + CPU state next to the sandbox's disk and
    /// stop its VMM, freeing its memory, CPU and network slot. Idempotent.
    pub async fn pause(&self, id: &str) -> Result<()> {
        let sbx = self.get(id).await.ok_or_else(|| anyhow::anyhow!("sandbox not found"))?;
        let mut guard = sbx.vm.lock().await;
        let Some((vm, slot)) = guard.take() else { return Ok(()) };
        let res: Result<()> = async {
            sbx.agent.sync().await?;
            vm.pause().await?;
            self.write_state(&sbx, &vm, &sbx.dir.join("paused.vm.snap"), &sbx.dir.join("paused.mem.snap")).await
        }
        .await;
        if let Err(e) = res {
            let _ = vm.resume().await;
            *guard = Some((vm, slot));
            return Err(e);
        }
        vm.kill().await;
        self.net.release(slot).await;
        Ok(())
    }

    /// Resume a paused sandbox. Exec and file calls resume automatically.
    pub async fn resume(&self, id: &str) -> Result<Option<CreateTimings>> {
        let sbx = self.get(id).await.ok_or_else(|| anyhow::anyhow!("sandbox not found"))?;
        self.resume_sandbox(&sbx).await
    }

    async fn resume_sandbox(&self, sbx: &Sandbox) -> Result<Option<CreateTimings>> {
        let mut guard = sbx.vm.lock().await;
        if guard.is_some() {
            return Ok(None);
        }
        let (vmstate, mem) = (sbx.dir.join("paused.vm.snap"), sbx.dir.join("paused.mem.snap"));
        let (vm, slot, t) = self.restore_into(&sbx.dir, &sbx.dir.join(ROOTFS), &vmstate, &mem).await?;
        // The restored memory file becomes the base for the next diff snapshot.
        let _ = std::fs::remove_file(&vmstate);
        std::fs::rename(&mem, sbx.dir.join("base.mem.tmp"))?;
        self.rebase(sbx, &sbx.dir.join("base.mem.tmp"))?;
        *guard = Some((vm, slot));
        Ok(Some(t))
    }

    pub async fn ensure_running(&self, sbx: &Sandbox) -> Result<()> {
        self.resume_sandbox(sbx).await.map(|_| ())
    }

    /// Mount an S3 bucket inside a running sandbox with rclone over FUSE. Credentials go
    /// in the process environment, never on its command line. Returns the mount path.
    pub async fn mount_s3(&self, sbx: &Sandbox, m: S3Mount) -> Result<String> {
        let ok_name = |s: &str| !s.is_empty() && s.len() <= 255 && s.chars().all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c));
        if !ok_name(&m.bucket) {
            bail!("invalid bucket name");
        }
        let path = m.path.clone().unwrap_or_else(|| format!("/mnt/{}", m.bucket));
        if !path.starts_with('/') || path.contains("..") || path.contains('\0') || path == "/" {
            bail!("mount path must be an absolute path");
        }
        let prefix = m.prefix.as_deref().unwrap_or("").trim_matches('/');
        if prefix.contains("..") || prefix.contains('\0') {
            bail!("invalid prefix");
        }
        self.ensure_running(sbx).await?;
        let run = |script: String, env: BTreeMap<String, String>, secs: u64| {
            let agent = sbx.agent.clone();
            async move {
                agent
                    .exec(jasmine_proto::ExecRequest { argv: vec!["/bin/sh".into(), "-c".into(), script], env, timeout_ms: Some(secs * 1000), ..Default::default() }, None)
                    .await
            }
        };
        // First mount in this sandbox: bring in rclone and the FUSE helper links.
        let have = run(format!("test -x {RCLONE_IN_GUEST}"), BTreeMap::new(), 10).await?;
        if have.exit_code != Some(0) {
            let bin = std::fs::read(&self.cfg.rclone_bin)
                .with_context(|| format!("S3 mounts need rclone on the host at {} (dev/setup-host.sh installs it)", self.cfg.rclone_bin.display()))?;
            sbx.agent.write_file(RCLONE_IN_GUEST, 0o755, &bin).await.context("copy rclone into the sandbox")?;
        }
        let mut env = BTreeMap::new();
        env.insert("RCLONE_S3_PROVIDER".into(), if m.endpoint.is_some() { "Other".into() } else { "AWS".into() });
        env.insert("RCLONE_S3_ENV_AUTH".into(), "false".into());
        env.insert("RCLONE_S3_NO_CHECK_BUCKET".into(), "true".into());
        for (k, v) in [
            ("RCLONE_S3_ENDPOINT", &m.endpoint),
            ("RCLONE_S3_REGION", &m.region),
            ("RCLONE_S3_ACCESS_KEY_ID", &m.access_key_id),
            ("RCLONE_S3_SECRET_ACCESS_KEY", &m.secret_access_key),
            ("RCLONE_S3_SESSION_TOKEN", &m.session_token),
        ] {
            if let Some(v) = v {
                env.insert(k.into(), v.clone());
            }
        }
        let remote = if prefix.is_empty() { format!(":s3:{}", m.bucket) } else { format!(":s3:{}/{prefix}", m.bucket) };
        let script = format!(
            "{FUSERMOUNT_LINKS}; mkdir -p /var/log {p} && exec {RCLONE_IN_GUEST} mount {r} {p} --daemon --daemon-wait 30s --allow-other \
             --vfs-cache-mode writes --vfs-write-back 1s --dir-cache-time 10s --log-file /var/log/jasmine-mount.log --log-level NOTICE{ro}",
            p = shell_quote_str(&path),
            r = shell_quote_str(&remote),
            ro = if m.read_only { " --read-only" } else { "" },
        );
        let out = run(script, env, 60).await?;
        if out.exit_code != Some(0) {
            let log = sbx.agent.read_file("/var/log/jasmine-mount.log").await.unwrap_or_default();
            bail!("mount failed: {}{}", out.stderr.trim(), tail(&String::from_utf8_lossy(&log)));
        }
        Ok(path)
    }

    /// Unmount a FUSE mount (e.g. an S3 bucket) inside a sandbox.
    pub async fn unmount(&self, sbx: &Sandbox, path: &str) -> Result<()> {
        if !path.starts_with('/') || path.contains('\0') {
            bail!("mount path must be an absolute path");
        }
        self.ensure_running(sbx).await?;
        // The agent acts as fusermount only when invoked under that name, so go through the link.
        let out = sbx
            .agent
            .exec(
                jasmine_proto::ExecRequest {
                    argv: vec!["/bin/sh".into(), "-c".into(), format!("{FUSERMOUNT_LINKS}; fusermount3 -u {}", shell_quote_str(path))],
                    timeout_ms: Some(30_000),
                    ..Default::default()
                },
                None,
            )
            .await?;
        if out.exit_code != Some(0) {
            bail!("unmount failed: {}", out.stderr.trim());
        }
        Ok(())
    }

    pub async fn is_paused(&self, sbx: &Sandbox) -> bool {
        sbx.vm.lock().await.is_none()
    }

    pub async fn get(&self, id: &str) -> Option<Arc<Sandbox>> {
        self.sandboxes.lock().await.get(id).cloned()
    }

    /// Sandboxes whose labels include every `labels` pair (and `key`, if given).
    pub async fn list(&self, labels: &BTreeMap<String, String>, key: Option<&str>) -> Vec<SandboxInfo> {
        let mut out: Vec<SandboxInfo> = self
            .sandboxes
            .lock()
            .await
            .values()
            .filter(|s| labels.iter().all(|(k, v)| s.labels.get(k) == Some(v)))
            .filter(|s| key.is_none_or(|k| s.key.as_deref() == Some(k)))
            .map(|s| s.info())
            .collect();
        out.sort_by_key(|s| s.created_unix);
        out
    }

    pub async fn delete(&self, id: &str) -> bool {
        let Some(sbx) = self.sandboxes.lock().await.remove(id) else { return false };
        let slot = match sbx.vm.lock().await.take() {
            Some((vm, slot)) => {
                vm.kill().await; // the VM is gone before we return
                Some(slot)
            }
            None => None,
        };
        // Recycling the network slot and removing files don't affect the caller.
        let (net, dir) = (self.net.clone(), sbx.dir.clone());
        tokio::spawn(async move {
            if let Some(slot) = slot {
                net.release(slot).await;
            }
            let _ = tokio::fs::remove_dir_all(&dir).await;
        });
        true
    }

    pub async fn shutdown(&self) {
        let ids: Vec<String> = self.sandboxes.lock().await.keys().cloned().collect();
        for id in ids {
            self.delete(&id).await;
        }
    }
}

/// Pull the image's executables, shared libraries and language runtimes into the
/// guest page cache before snapshotting, up to `$1` MiB. Not tailored to any
/// benchmark command: it is whatever the image ships in standard paths,
/// binaries and libraries first. The pages live in the snapshot memory file,
/// which all sandboxes share read-only through the host page cache.
const PREWARM: &str = r#"
budget=$(( $1 * 1024 * 1024 )); used=0; n=0
list() {
  for d in /lib /lib64 /usr/lib /usr/lib64 /usr/libexec /bin /sbin /usr/bin /usr/sbin /usr/local/bin /usr/local/lib; do
    [ -d "$d" ] && find "$d" -xdev -type f -size -64M "$@" 2>/dev/null
  done
}
{ list \( -perm -u+x -o -name '*.so' -o -name '*.so.*' \); list -name '*.pyc'; list -name '*.js' -path '*node_modules*'; } |
while IFS= read -r f; do
  s=$(stat -c %s "$f" 2>/dev/null || echo 0)
  [ $((used + s)) -gt "$budget" ] && continue
  cat "$f" > /dev/null 2>&1 && used=$((used + s)) && n=$((n + 1))
  echo "$n $used" > /run/prewarm.stat
done
for py in python3 python; do command -v $py >/dev/null && $py -c 'import os, sys, json, re, subprocess, pathlib, typing, asyncio' && break; done
command -v node >/dev/null && node -e '0'
sh -c true
read n used < /run/prewarm.stat 2>/dev/null; echo "files=$n bytes=$used"
"#;

fn go_arch() -> &'static str {
    if cfg!(target_arch = "aarch64") {
        "arm64"
    } else {
        "amd64"
    }
}

fn shell_quote_str(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

/// Last ~2 KB of command output, for error messages.
fn tail(s: &str) -> String {
    let start = s.len().saturating_sub(2048);
    let start = (start..=s.len()).find(|&i| s.is_char_boundary(i)).unwrap_or(s.len());
    s[start..].to_string()
}
