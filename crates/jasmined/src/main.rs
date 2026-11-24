mod agent;
mod api;
mod fc;
mod manager;
mod net;

use anyhow::Result;
use clap::{Parser, Subcommand};
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "jasmined", version, about = "Jasmine sandbox daemon")]
struct Cli {
    /// State directory. Put it on XFS (reflink=1) so sandbox disks are copy-on-write clones.
    #[arg(long, env = "JASMINE_DATA", default_value = "/var/lib/jasmine", global = true)]
    data: PathBuf,
    #[arg(long, env = "JASMINE_FIRECRACKER", default_value = "/usr/local/bin/firecracker", global = true)]
    firecracker: PathBuf,
    #[arg(long, env = "JASMINE_KERNEL", default_value = "/var/lib/jasmine/vmlinux", global = true)]
    kernel: PathBuf,
    /// Static guest agent binary copied into every template.
    #[arg(long, env = "JASMINE_AGENT", default_value = "/usr/local/lib/jasmine/jasmine-agent", global = true)]
    agent: PathBuf,
    /// Network namespaces kept ready for new sandboxes.
    #[arg(long, env = "JASMINE_NET_POOL", default_value_t = 32, global = true)]
    net_pool: usize,
    /// Run each microVM's VMM as an unprivileged uid (base + 1 + network slot)
    /// instead of root; gid `base` is the shared group that can read templates. Recommended for hosts that run other people's code.
    #[arg(long, env = "JASMINE_VM_UID_BASE", global = true)]
    vm_uid_base: Option<u32>,
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// Run the HTTP API.
    Serve {
        #[arg(long, env = "JASMINE_LISTEN", default_value = "127.0.0.1:7171")]
        listen: String,
        /// Require `Authorization: Bearer <key>` on /v1.
        #[arg(long, env = "JASMINE_API_KEY")]
        api_key: Option<String>,
    },
    /// Build a template (OCI image → snapshot) without running the server.
    Build {
        name: String,
        image: String,
        #[arg(long, default_value_t = 2)]
        vcpus: u32,
        #[arg(long, default_value_t = 1024)]
        mem_mib: u32,
        /// Page-cache prewarm budget before snapshotting (0 = off).
        #[arg(long, default_value_t = 256)]
        prewarm_mib: u32,
        /// Shell command run once before the snapshot, e.g. 'apt-get update && apt-get install -y chromium'.
        #[arg(long)]
        setup: Option<String>,
        /// Shell command left running in the snapshot, so every sandbox starts with it up (e.g. a headless browser).
        #[arg(long)]
        start: Option<String>,
        /// Port the --start command listens on; the build waits for it before snapshotting.
        #[arg(long)]
        ready_port: Option<u16>,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt().with_env_filter(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into())).init();
    let cli = Cli::parse();
    let cfg = manager::Config { data: cli.data, firecracker: cli.firecracker, kernel: cli.kernel, agent_bin: cli.agent, vm_uid_base: cli.vm_uid_base };
    let server = matches!(cli.cmd, Cmd::Serve { .. });
    let mgr = manager::Manager::new(cfg, server, if server { cli.net_pool } else { 0 }).await?;
    match cli.cmd {
        Cmd::Build { name, image, vcpus, mem_mib, prewarm_mib, setup, start, ready_port } => {
            let meta = mgr.build_template(&name, &image, vcpus, mem_mib, prewarm_mib, manager::BuildOpts { setup, start, ready_port }).await?;
            println!("{}", serde_json::to_string_pretty(&meta)?);
        }
        Cmd::Serve { listen, api_key } => {
            let app = api::router(mgr.clone(), api_key);
            let listener = tokio::net::TcpListener::bind(&listen).await?;
            tracing::info!("jasmined listening on {listen}");
            axum::serve(listener, app)
                .with_graceful_shutdown(async {
                    let _ = tokio::signal::ctrl_c().await;
                })
                .await?;
            mgr.shutdown().await;
        }
    }
    Ok(())
}
