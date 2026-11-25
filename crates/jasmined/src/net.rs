//! Per-sandbox networking.
//!
//! Every sandbox is restored from the same snapshot, so every guest has the
//! same baked-in config: eth0 = 172.16.0.2/30 via 172.16.0.1, backed by a
//! host tap device named `tap0`. To let many such guests coexist, each
//! Firecracker process runs in its own network namespace ("slot") holding its
//! own `tap0`. Each slot NATs the guest to a unique veth address, and the host
//! masquerades that out to the internet.
//!
//! IPv6 mirrors this: the guest is fd00:6a73::2/126 via fd00:6a73::1 (set by the
//! agent at boot), each slot NATs it to a unique address in fd00:6a73:1::/64, and
//! the host masquerades that out. It is best-effort: on a host without IPv6 (or
//! without ip6tables NAT) sandboxes stay IPv4-only and the guest's IPv6 route fails
//! fast with "network unreachable", so dual-stack clients fall back at once.
//!
//! Slot setup costs tens of milliseconds of `ip`/`iptables` calls, so slots are
//! built ahead of time and recycled. This keeps the create path free of
//! network plumbing; it is infrastructure, not pre-started VMs.

use anyhow::{bail, Context, Result};
use std::collections::VecDeque;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;
use tokio::sync::{Mutex, Notify};

pub const GUEST_IP: &str = "172.16.0.2";
pub const GATEWAY_IP: &str = "172.16.0.1";
pub const GUEST_MAC: &str = "06:00:ac:10:00:02";
pub const TAP: &str = "tap0";
/// Every slot's tap gets the same MAC, so a guest restored into a different slot
/// (resume, create-from-snapshot) still has a valid ARP entry for its gateway.
pub const GATEWAY_MAC: &str = "06:00:ac:10:00:01";
/// Kernel cmdline fragment: static IP config, no DHCP.
pub const KERNEL_IP_ARG: &str = "ip=172.16.0.2::172.16.0.1:255.255.255.252::eth0:off";
const MAX_SLOTS: u32 = 16_000;
/// Guest and gateway IPv6 inside every slot. Must match the agent (crates/agent/src/sys.rs).
pub const GUEST_IP6: &str = "fd00:6a73::2";
pub const GATEWAY_IP6: &str = "fd00:6a73::1";
/// Host side: one /126 per slot.
const SLOT_NET6: &str = "fd00:6a73:1::/64";

pub struct NetPool {
    /// When set, slot k's tap belongs to uid `base + k + 1`, the uid its VMM runs as.
    pub vm_uid_base: Option<u32>,
    /// Host IPv6 forwarding and NAT are set up; slots get IPv6 too.
    ipv6: bool,
    free: Mutex<VecDeque<u32>>,
    next: AtomicU32,
    min_free: usize,
    wake: Notify,
}

pub struct Slot(pub u32);

impl Slot {
    pub fn netns_path(&self) -> String {
        format!("/var/run/netns/{}", ns_name(self.0))
    }
}

fn ns_name(k: u32) -> String {
    format!("wrn{k}")
}

/// Host-side /30 for slot k: 10.200.0.0/16 split into 16384 subnets.
fn veth_ips(k: u32) -> (String, String) {
    let base = k * 4;
    let (hi, lo) = (base / 256, base % 256);
    (format!("10.200.{hi}.{}", lo + 1), format!("10.200.{hi}.{}", lo + 2))
}

/// Host-side IPv6 /126 for slot k inside fd00:6a73:1::/64.
fn veth_ips6(k: u32) -> (String, String) {
    let base = k * 4;
    let (hi, lo) = (base >> 16, base & 0xffff);
    (format!("fd00:6a73:1::{hi:x}:{:x}", lo + 1), format!("fd00:6a73:1::{hi:x}:{:x}", lo + 2))
}

/// Host IPv6: forwarding, NAT66 and the same isolation rules as IPv4. Idempotent.
async fn host_ipv6() -> Result<()> {
    sh(&format!(
        r#"
[ -d /proc/sys/net/ipv6 ] && [ "$(cat /proc/sys/net/ipv6/conf/all/disable_ipv6)" = 0 ]
command -v ip6tables >/dev/null
# Turning on forwarding makes the kernel ignore router advertisements, which would drop a
# host's SLAAC default route. Keep accepting them on the interface that carries it.
dev=$(ip -6 route show default 2>/dev/null | awk '{{for (i = 1; i < NF; i++) if ($i == "dev") {{ print $(i + 1); exit }}}}')
if [ -n "$dev" ]; then sysctl -qw "net.ipv6.conf.$dev.accept_ra=2" || true; fi
sysctl -qw net.ipv6.conf.all.forwarding=1
R={SLOT_NET6}
ip6tables -t nat -C POSTROUTING -s $R ! -d $R -j MASQUERADE 2>/dev/null || ip6tables -t nat -A POSTROUTING -s $R ! -d $R -j MASQUERADE
ip6tables -C FORWARD -s $R -j ACCEPT 2>/dev/null || ip6tables -I FORWARD -s $R -j ACCEPT
ip6tables -C FORWARD -d $R -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT 2>/dev/null ||
  ip6tables -I FORWARD -d $R -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
# Isolation, above the accepts: no sandbox-to-sandbox, no cloud metadata (AWS fd00:ec2::254),
# nothing on the host itself, no outbound SMTP.
ip6tables -C FORWARD -s $R -d $R -j DROP 2>/dev/null || ip6tables -I FORWARD -s $R -d $R -j DROP
ip6tables -C FORWARD -s $R -d fd00:ec2::/32 -j DROP 2>/dev/null || ip6tables -I FORWARD -s $R -d fd00:ec2::/32 -j DROP
ip6tables -C INPUT -s $R -j DROP 2>/dev/null || ip6tables -I INPUT -s $R -j DROP
# ...except neighbour discovery. Unlike ARP, it is ICMPv6 and passes through INPUT; without
# it the slot can never resolve the host's address and nothing is forwarded. (-I puts these above the drop.)
for t in neighbour-solicitation neighbour-advertisement; do
  ip6tables -C INPUT -s $R -p ipv6-icmp --icmpv6-type $t -j ACCEPT 2>/dev/null || ip6tables -I INPUT -s $R -p ipv6-icmp --icmpv6-type $t -j ACCEPT
done
ip6tables -C FORWARD -s $R -p tcp --dport 25 -j DROP 2>/dev/null || ip6tables -I FORWARD -s $R -p tcp --dport 25 -j DROP
"#
    ))
    .await
}

async fn sh(script: &str) -> Result<()> {
    let out = tokio::process::Command::new("sh").arg("-ec").arg(script).output().await?;
    if !out.status.success() {
        bail!("{}\n--- script ---\n{script}", String::from_utf8_lossy(&out.stderr));
    }
    Ok(())
}

impl NetPool {
    /// `server`: true for the long-running daemon, which owns slots 0..MAX_SLOTS and
    /// clears leftovers from a previous run. One-shot CLI builds use a private slot
    /// above that range and leave the server's slots alone.
    pub async fn new(min_free: usize, server: bool, vm_uid_base: Option<u32>) -> Result<Arc<Self>> {
        let cleanup = if server {
            r#"
for ns in $(ip netns list | awk '{print $1}' | grep '^wrn[0-9]*$' || true); do ip netns del "$ns"; done
for l in $(ip -o link show | awk -F': ' '{print $2}' | cut -d@ -f1 | grep '^wrv[0-9]*$' || true); do ip link del "$l" 2>/dev/null || true; done
"#
        } else {
            ""
        };
        // Host: forwarding + masquerade for the slot range. Idempotent.
        sh(&format!(r#"
sysctl -qw net.ipv4.ip_forward=1
iptables -t nat -C POSTROUTING -s 10.200.0.0/16 ! -d 10.200.0.0/16 -j MASQUERADE 2>/dev/null ||
  iptables -t nat -A POSTROUTING -s 10.200.0.0/16 ! -d 10.200.0.0/16 -j MASQUERADE
iptables -C FORWARD -s 10.200.0.0/16 -j ACCEPT 2>/dev/null || iptables -I FORWARD -s 10.200.0.0/16 -j ACCEPT
iptables -C FORWARD -d 10.200.0.0/16 -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT 2>/dev/null ||
  iptables -I FORWARD -d 10.200.0.0/16 -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
# Isolation, inserted above the accepts: no sandbox-to-sandbox traffic, no cloud
# metadata endpoint (credential theft), no access to services on the host itself.
iptables -C FORWARD -s 10.200.0.0/16 -d 10.200.0.0/16 -j DROP 2>/dev/null || iptables -I FORWARD -s 10.200.0.0/16 -d 10.200.0.0/16 -j DROP
iptables -C FORWARD -s 10.200.0.0/16 -d 169.254.0.0/16 -j DROP 2>/dev/null || iptables -I FORWARD -s 10.200.0.0/16 -d 169.254.0.0/16 -j DROP
iptables -C INPUT -s 10.200.0.0/16 -j DROP 2>/dev/null || iptables -I INPUT -s 10.200.0.0/16 -j DROP
# No outbound SMTP: a sandbox must not be usable as a spam relay.
iptables -C FORWARD -s 10.200.0.0/16 -p tcp --dport 25 -j DROP 2>/dev/null || iptables -I FORWARD -s 10.200.0.0/16 -p tcp --dport 25 -j DROP
{cleanup}"#))
        .await
        .context("host network setup (needs root, iproute2, iptables)")?;
        let ipv6 = match host_ipv6().await {
            Ok(()) => true,
            Err(e) => {
                tracing::warn!("IPv6 unavailable on this host; sandboxes are IPv4-only: {e:#}");
                false
            }
        };
        let first = if server { 0 } else { MAX_SLOTS + 1 + std::process::id() % 300 };
        let pool = Arc::new(NetPool { vm_uid_base, ipv6, free: Mutex::new(VecDeque::new()), next: AtomicU32::new(first), min_free, wake: Notify::new() });
        // Fill synchronously to the minimum so the first creates are fast, then keep topped up.
        for _ in 0..min_free {
            let k = pool.build_slot().await?;
            pool.free.lock().await.push_back(k);
        }
        let bg = pool.clone();
        tokio::spawn(async move {
            loop {
                while bg.free.lock().await.len() < bg.min_free {
                    match bg.build_slot().await {
                        Ok(k) => bg.free.lock().await.push_back(k),
                        Err(e) => {
                            tracing::error!("net slot build failed: {e:#}");
                            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                        }
                    }
                }
                bg.wake.notified().await;
            }
        });
        Ok(pool)
    }

    async fn build_slot(&self) -> Result<u32> {
        let k = self.next.fetch_add(1, Ordering::SeqCst);
        if k == MAX_SLOTS {
            bail!("out of network slots");
        }
        let (ns, (host_ip, ns_ip)) = (ns_name(k), veth_ips(k));
        let owner = self.vm_uid_base.map(|b| format!(" user {u} group {u}", u = b + k + 1)).unwrap_or_default();
        sh(&format!(
            r#"
ip netns add {ns}
ip link add wrv{k} type veth peer name veth0 netns {ns}
ip addr add {host_ip}/30 dev wrv{k}
ip link set wrv{k} up
ip -n {ns} -b - <<EOF
link set lo up
addr add {ns_ip}/30 dev veth0
link set veth0 up
route add default via {host_ip}
tuntap add {TAP} mode tap{owner}
link set {TAP} address {GATEWAY_MAC}
addr add {GATEWAY_IP}/30 dev {TAP}
link set {TAP} up
EOF
ip netns exec {ns} sh -ec '
  sysctl -qw net.ipv4.ip_forward=1
  iptables -t nat -A POSTROUTING -o veth0 -s {GUEST_IP} -j MASQUERADE
'
"#
        ))
        .await?;
        if self.ipv6 {
            let (host_ip6, ns_ip6) = veth_ips6(k);
            // Best-effort: a slot without IPv6 still works over IPv4.
            if let Err(e) = sh(&format!(
                r#"
ip -6 addr add {host_ip6}/126 dev wrv{k} nodad
ip -n {ns} -6 addr add {ns_ip6}/126 dev veth0 nodad
ip -n {ns} -6 route add default via {host_ip6}
ip -n {ns} -6 addr add {GATEWAY_IP6}/126 dev {TAP} nodad
ip netns exec {ns} sh -ec '
  sysctl -qw net.ipv6.conf.all.forwarding=1
  ip6tables -t nat -A POSTROUTING -o veth0 -s {GUEST_IP6} -j MASQUERADE
'
"#
            ))
            .await
            {
                tracing::warn!("slot {k}: IPv6 setup failed, IPv4 only: {e:#}");
            }
        }
        Ok(k)
    }

    pub async fn acquire(&self) -> Result<Slot> {
        let popped = self.free.lock().await.pop_front();
        self.wake.notify_one();
        match popped {
            Some(k) => Ok(Slot(k)),
            None => {
                tracing::warn!("net slot pool empty; building one inline (raise --net-pool)");
                Ok(Slot(self.build_slot().await?))
            }
        }
    }

    /// Return a slot once its VM is gone. Flushing conntrack keeps the next
    /// tenant from inheriting the previous one's NAT state.
    pub async fn release(&self, slot: Slot) {
        let ns = ns_name(slot.0);
        let _ = sh(&format!("ip netns exec {ns} sh -c 'conntrack -F; conntrack -F -f ipv6' 2>/dev/null || true")).await;
        self.free.lock().await.push_back(slot.0);
    }
}

impl NetPool {
    /// Tear a slot down entirely (CLI builds; the server recycles instead).
    pub async fn destroy(&self, slot: Slot) {
        let _ = sh(&format!("ip netns del {}; ip link del wrv{} 2>/dev/null || true", ns_name(slot.0), slot.0)).await;
    }
}
