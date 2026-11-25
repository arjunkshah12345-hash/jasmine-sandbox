//! A minimal `fusermount` / `fusermount3`, so FUSE filesystems (rclone for S3 mounts,
//! sshfs, ...) work in images that don't ship libfuse's helper.
//!
//! Templates link `/usr/local/bin/fusermount{,3}` to this binary; `main` dispatches on
//! argv[0]. It speaks the helper's protocol: the caller passes a socket in
//! `_FUSE_COMMFD`; we open /dev/fuse, mount it, and send the descriptor back with
//! SCM_RIGHTS. Unmount is `-u [-z] <mountpoint>`. Everything in a sandbox runs as root,
//! so there are no setuid checks to make.

use std::ffi::CString;
use std::io;
use std::os::unix::fs::MetadataExt;

pub fn main(args: &[String]) -> i32 {
    match run(args) {
        Ok(()) => 0,
        Err(e) => {
            eprintln!("fusermount: {e}");
            1
        }
    }
}

fn run(args: &[String]) -> io::Result<()> {
    let (mut opts, mut unmount, mut lazy, mut mnt) = (Vec::<String>::new(), false, false, None::<String>);
    let mut it = args.iter().skip(1);
    while let Some(a) = it.next() {
        match a.as_str() {
            "-o" => opts.extend(it.next().map(|o| o.split(',').map(String::from).collect::<Vec<_>>()).unwrap_or_default()),
            "-u" => unmount = true,
            "-z" => lazy = true,
            "-q" | "--" => {}
            "-V" | "--version" => {
                println!("fusermount3 version: 3.16.2 (jasmine)");
                return Ok(());
            }
            o if o.starts_with("-o") => opts.extend(o[2..].split(',').map(String::from)),
            o if o.starts_with('-') => return Err(io::Error::other(format!("unsupported option {o}"))),
            m => mnt = Some(m.to_string()),
        }
    }
    let mnt = mnt.ok_or_else(|| io::Error::other("no mountpoint"))?;
    let target = CString::new(mnt.as_str()).map_err(io::Error::other)?;

    if unmount {
        let rc = unsafe { libc::umount2(target.as_ptr(), if lazy { libc::MNT_DETACH } else { 0 }) };
        return if rc == 0 { Ok(()) } else { Err(io::Error::last_os_error()) };
    }

    let commfd: libc::c_int = std::env::var("_FUSE_COMMFD")
        .ok()
        .and_then(|v| v.parse().ok())
        .ok_or_else(|| io::Error::other("_FUSE_COMMFD not set (fusermount is a helper for FUSE filesystems)"))?;

    // Kernel mount flags, what goes in the fuse data string, and the source/type names.
    let mut flags: libc::c_ulong = libc::MS_NOSUID | libc::MS_NODEV;
    let (mut extra, mut fsname, mut subtype) = (Vec::new(), None, None);
    for o in opts.iter().filter(|o| !o.is_empty()) {
        match o.as_str() {
            "ro" => flags |= libc::MS_RDONLY,
            "rw" => flags &= !libc::MS_RDONLY,
            "noexec" => flags |= libc::MS_NOEXEC,
            "exec" => flags &= !libc::MS_NOEXEC,
            "suid" => flags &= !libc::MS_NOSUID,
            "nosuid" => flags |= libc::MS_NOSUID,
            "dev" => flags &= !libc::MS_NODEV,
            "nodev" => flags |= libc::MS_NODEV,
            "sync" => flags |= libc::MS_SYNCHRONOUS,
            "async" => flags &= !libc::MS_SYNCHRONOUS,
            "noatime" => flags |= libc::MS_NOATIME,
            "dirsync" => flags |= libc::MS_DIRSYNC,
            "allow_other" | "allow_root" | "default_permissions" => extra.push(o.clone()),
            o if o.starts_with("max_read=") || o.starts_with("blksize=") => extra.push(o.to_string()),
            o if o.starts_with("fsname=") => fsname = Some(o["fsname=".len()..].to_string()),
            o if o.starts_with("subtype=") => subtype = Some(o["subtype=".len()..].to_string()),
            _ => {} // userspace-only options (auto_unmount, nonempty, ...): nothing for the kernel
        }
    }

    let ctx = |what: String| move |e: io::Error| io::Error::new(e.kind(), format!("{what}: {e}"));
    let rootmode = std::fs::metadata(&mnt).map_err(ctx(format!("mountpoint {mnt}")))?.mode() & libc::S_IFMT;
    let dev = c"/dev/fuse";
    // devtmpfs normally has it; create it if not (FUSE is always char 10:229).
    if !std::path::Path::new("/dev/fuse").exists() {
        unsafe { libc::mknod(dev.as_ptr(), libc::S_IFCHR | 0o666, libc::makedev(10, 229)) };
    }
    let fd = unsafe { libc::open(dev.as_ptr(), libc::O_RDWR) };
    if fd < 0 {
        return Err(ctx("open /dev/fuse (is FUSE in the guest kernel?)".into())(io::Error::last_os_error()));
    }
    let mut data = format!("fd={fd},rootmode={rootmode:o},user_id=0,group_id=0");
    for e in &extra {
        data.push(',');
        data.push_str(e);
    }
    let data = CString::new(data).unwrap();
    let source = CString::new(fsname.clone().unwrap_or_else(|| "fuse".into())).map_err(io::Error::other)?;
    let try_mount = |fstype: &str| {
        let t = CString::new(fstype).unwrap();
        unsafe { libc::mount(source.as_ptr(), target.as_ptr(), t.as_ptr(), flags, data.as_ptr().cast()) }
    };
    let mut rc = match &subtype {
        Some(s) => try_mount(&format!("fuse.{s}")),
        None => try_mount("fuse"),
    };
    if rc != 0 && subtype.is_some() && io::Error::last_os_error().raw_os_error() == Some(libc::ENODEV) {
        rc = try_mount("fuse"); // kernels without subtype support
    }
    if rc != 0 {
        let e = io::Error::last_os_error();
        unsafe { libc::close(fd) };
        return Err(ctx(format!("mount {mnt}"))(e));
    }

    let sent = send_fd(commfd, fd);
    unsafe { libc::close(fd) };
    if let Err(e) = sent {
        unsafe { libc::umount2(target.as_ptr(), libc::MNT_DETACH) };
        return Err(ctx("pass the fuse fd back over _FUSE_COMMFD".into())(e));
    }
    Ok(())
}

/// Send `fd` over the unix socket `sock` (SCM_RIGHTS), with the one-byte payload libfuse expects.
fn send_fd(sock: libc::c_int, fd: libc::c_int) -> io::Result<()> {
    unsafe {
        let mut byte = 0u8;
        let mut iov = libc::iovec { iov_base: (&mut byte as *mut u8).cast(), iov_len: 1 };
        let space = libc::CMSG_SPACE(std::mem::size_of::<libc::c_int>() as u32) as usize;
        let mut buf = vec![0u8; space];
        let mut msg: libc::msghdr = std::mem::zeroed();
        msg.msg_iov = &mut iov;
        msg.msg_iovlen = 1;
        msg.msg_control = buf.as_mut_ptr().cast();
        msg.msg_controllen = space as _;
        let cmsg = libc::CMSG_FIRSTHDR(&msg);
        (*cmsg).cmsg_level = libc::SOL_SOCKET;
        (*cmsg).cmsg_type = libc::SCM_RIGHTS;
        (*cmsg).cmsg_len = libc::CMSG_LEN(std::mem::size_of::<libc::c_int>() as u32) as _;
        std::ptr::write_unaligned(libc::CMSG_DATA(cmsg).cast::<libc::c_int>(), fd);
        if libc::sendmsg(sock, &msg, 0) < 0 {
            return Err(io::Error::last_os_error());
        }
    }
    Ok(())
}
