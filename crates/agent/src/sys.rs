use std::ffi::CString;
use std::io;

fn mount(src: &str, target: &str, fstype: &str, flags: libc::c_ulong, data: Option<&str>) {
    let _ = std::fs::create_dir_all(target);
    let (s, t, f) = (CString::new(src).unwrap(), CString::new(target).unwrap(), CString::new(fstype).unwrap());
    let d = data.map(|d| CString::new(d).unwrap());
    let rc = unsafe {
        libc::mount(s.as_ptr(), t.as_ptr(), f.as_ptr(), flags, d.as_ref().map_or(std::ptr::null(), |d| d.as_ptr().cast()))
    };
    if rc != 0 {
        let e = io::Error::last_os_error();
        // EBUSY = already mounted (e.g. devtmpfs automount); harmless.
        if e.raw_os_error() != Some(libc::EBUSY) {
            eprintln!("jasmine-agent: mount {target}: {e}");
        }
    }
}

pub fn init_system() {
    // noatime on the root fs: reads shouldn't cause metadata writes. (It's a VFS
    // flag, so it can't go in the kernel's rootflags=, which ext4 would reject.)
    unsafe {
        let root = c"/";
        if libc::mount(std::ptr::null(), root.as_ptr(), std::ptr::null(), libc::MS_REMOUNT | libc::MS_NOATIME, std::ptr::null()) != 0 {
            eprintln!("jasmine-agent: remount / noatime: {}", io::Error::last_os_error());
        }
    }
    let nodev = libc::MS_NOSUID | libc::MS_NODEV | libc::MS_NOEXEC;
    mount("proc", "/proc", "proc", nodev, None);
    mount("sysfs", "/sys", "sysfs", nodev, None);
    mount("devtmpfs", "/dev", "devtmpfs", libc::MS_NOSUID, Some("mode=0755"));
    mount("devpts", "/dev/pts", "devpts", libc::MS_NOSUID | libc::MS_NOEXEC, Some("gid=5,mode=620,ptmxmode=666"));
    mount("tmpfs", "/dev/shm", "tmpfs", libc::MS_NOSUID | libc::MS_NODEV, None);
    mount("tmpfs", "/run", "tmpfs", libc::MS_NOSUID | libc::MS_NODEV, Some("mode=0755"));
    mount("cgroup2", "/sys/fs/cgroup", "cgroup2", nodev, None);
    for (link, target) in [("/dev/fd", "/proc/self/fd"), ("/dev/stdin", "/proc/self/fd/0"), ("/dev/stdout", "/proc/self/fd/1"), ("/dev/stderr", "/proc/self/fd/2")] {
        let _ = std::os::unix::fs::symlink(target, link);
    }
    let _ = std::fs::remove_file("/dev/ptmx");
    let _ = std::os::unix::fs::symlink("pts/ptmx", "/dev/ptmx");
    let host = b"jasmine";
    unsafe { libc::sethostname(host.as_ptr().cast(), host.len()) };
    if let Err(e) = link_up("lo") {
        eprintln!("jasmine-agent: lo up: {e}");
    }
    // IPv4 comes from the kernel's ip= argument. IPv6 has no such argument, so set it here:
    // a fixed address and default route, like IPv4 (the host gives every slot the same
    // gateway), and skip duplicate address detection so it works the instant we restore.
    if let Err(e) = ipv6_setup("eth0") {
        eprintln!("jasmine-agent: ipv6: {e}");
    }
    unsafe { libc::setsid() };
}

/// Reap every child (we are PID 1, orphans land on us) until `server` exits.
pub fn reap_until(server: libc::pid_t) {
    loop {
        let mut status = 0;
        let pid = unsafe { libc::waitpid(-1, &mut status, 0) };
        if pid == server {
            return;
        }
        if pid < 0 && io::Error::last_os_error().raw_os_error() == Some(libc::ECHILD) {
            return;
        }
    }
}

fn link_up(name: &str) -> io::Result<()> {
    unsafe {
        let fd = libc::socket(libc::AF_INET, libc::SOCK_DGRAM | libc::SOCK_CLOEXEC, 0);
        if fd < 0 {
            return Err(io::Error::last_os_error());
        }
        let mut req: libc::ifreq = std::mem::zeroed();
        for (i, b) in name.bytes().enumerate() {
            req.ifr_name[i] = b as libc::c_char;
        }
        let mut rc = libc::ioctl(fd, libc::SIOCGIFFLAGS as _, &mut req);
        if rc == 0 {
            req.ifr_ifru.ifru_flags |= libc::IFF_UP as libc::c_short;
            rc = libc::ioctl(fd, libc::SIOCSIFFLAGS as _, &mut req);
        }
        let err = io::Error::last_os_error();
        libc::close(fd);
        if rc != 0 {
            return Err(err);
        }
    }
    Ok(())
}

pub fn vsock_listen(port: u32) -> io::Result<libc::c_int> {
    unsafe {
        let fd = libc::socket(libc::AF_VSOCK, libc::SOCK_STREAM | libc::SOCK_CLOEXEC, 0);
        if fd < 0 {
            return Err(io::Error::last_os_error());
        }
        let mut addr: libc::sockaddr_vm = std::mem::zeroed();
        addr.svm_family = libc::AF_VSOCK as libc::sa_family_t;
        addr.svm_port = port;
        addr.svm_cid = libc::VMADDR_CID_ANY;
        if libc::bind(fd, (&addr as *const libc::sockaddr_vm).cast(), std::mem::size_of::<libc::sockaddr_vm>() as u32) != 0
            || libc::listen(fd, 1024) != 0
        {
            return Err(io::Error::last_os_error());
        }
        Ok(fd)
    }
}

pub fn set_clock(unix_ns: u64) {
    let ts = libc::timespec { tv_sec: (unix_ns / 1_000_000_000) as _, tv_nsec: (unix_ns % 1_000_000_000) as _ };
    unsafe { libc::clock_settime(libc::CLOCK_REALTIME, &ts) };
}

/// Credit host-provided randomness to the guest RNG (RNDADDENTROPY).
/// Without this, every sandbox restored from one snapshot would start with
/// identical RNG state.
pub fn add_entropy(bytes: &[u8]) {
    const RNDADDENTROPY: libc::c_ulong = 0x4008_5203;
    let mut buf = Vec::with_capacity(8 + bytes.len());
    buf.extend_from_slice(&((bytes.len() * 8) as i32).to_ne_bytes());
    buf.extend_from_slice(&(bytes.len() as i32).to_ne_bytes());
    buf.extend_from_slice(bytes);
    unsafe {
        let fd = libc::open(c"/dev/urandom".as_ptr(), libc::O_WRONLY | libc::O_CLOEXEC);
        if fd >= 0 {
            libc::ioctl(fd, RNDADDENTROPY as _, buf.as_ptr());
            libc::close(fd);
        }
    }
}

/// Guest IPv6, mirroring the IPv4 /30: fd00:6a73::2/126 via fd00:6a73::1. Must match the host (jasmined net.rs).
const GUEST_IP6: [u16; 8] = [0xfd00, 0x6a73, 0, 0, 0, 0, 0, 2];
const GATEWAY_IP6: [u16; 8] = [0xfd00, 0x6a73, 0, 0, 0, 0, 0, 1];

fn in6(a: [u16; 8]) -> libc::in6_addr {
    let mut b = [0u8; 16];
    for (i, w) in a.iter().enumerate() {
        b[2 * i..2 * i + 2].copy_from_slice(&w.to_be_bytes());
    }
    libc::in6_addr { s6_addr: b }
}

/// `struct in6_ifreq` from <linux/ipv6.h>.
#[repr(C)]
struct In6Ifreq {
    addr: libc::in6_addr,
    prefixlen: u32,
    ifindex: libc::c_int,
}

/// `struct in6_rtmsg` from <linux/ipv6_route.h>.
#[repr(C)]
struct In6Rtmsg {
    dst: libc::in6_addr,
    src: libc::in6_addr,
    gateway: libc::in6_addr,
    typ: u32,
    dst_len: u16,
    src_len: u16,
    metric: u32,
    info: libc::c_ulong,
    flags: u32,
    ifindex: libc::c_int,
}

fn ipv6_setup(ifname: &str) -> io::Result<()> {
    if !std::path::Path::new("/proc/sys/net/ipv6").exists() {
        return Ok(()); // guest kernel built without IPv6
    }
    // No DAD (the address is ours by construction), no router advertisements or autoconf
    // (the route is static), so nothing changes after the snapshot is taken.
    for (k, v) in [("accept_dad", "0"), ("dad_transmits", "0"), ("accept_ra", "0"), ("autoconf", "0")] {
        let _ = std::fs::write(format!("/proc/sys/net/ipv6/conf/{ifname}/{k}"), v);
        let _ = std::fs::write(format!("/proc/sys/net/ipv6/conf/default/{k}"), v);
    }
    let name = CString::new(ifname).unwrap();
    let ifindex = unsafe { libc::if_nametoindex(name.as_ptr()) } as libc::c_int;
    if ifindex == 0 {
        return Err(io::Error::last_os_error());
    }
    unsafe {
        let fd = libc::socket(libc::AF_INET6, libc::SOCK_DGRAM | libc::SOCK_CLOEXEC, 0);
        if fd < 0 {
            return Err(io::Error::last_os_error());
        }
        let ifr = In6Ifreq { addr: in6(GUEST_IP6), prefixlen: 126, ifindex };
        let mut rc = libc::ioctl(fd, libc::SIOCSIFADDR as _, &ifr);
        if rc != 0 && io::Error::last_os_error().raw_os_error() == Some(libc::EEXIST) {
            rc = 0;
        }
        if rc == 0 {
            let rt = In6Rtmsg {
                dst: in6([0; 8]),
                src: in6([0; 8]),
                gateway: in6(GATEWAY_IP6),
                typ: 0,
                dst_len: 0,
                src_len: 0,
                metric: 1,
                info: 0,
                flags: (libc::RTF_UP | libc::RTF_GATEWAY) as u32,
                ifindex,
            };
            rc = libc::ioctl(fd, libc::SIOCADDRT as _, &rt);
            if rc != 0 && io::Error::last_os_error().raw_os_error() == Some(libc::EEXIST) {
                rc = 0;
            }
        }
        let err = io::Error::last_os_error();
        libc::close(fd);
        if rc != 0 {
            return Err(err);
        }
    }
    Ok(())
}
