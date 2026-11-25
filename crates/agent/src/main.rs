//! jasmine-agent: PID 1 inside every Jasmine microVM.
//!
//! As init it mounts the pseudo filesystems, brings up loopback, then forks a
//! server child and reaps orphans forever. The server listens on vsock and
//! handles one request per connection on its own thread.
//!
//! For testing outside a VM: `JASMINE_AGENT_UNIX=/tmp/agent.sock jasmine-agent`.

#[cfg(not(target_os = "linux"))]
compile_error!("jasmine-agent only runs inside a Linux guest");

mod fuse;
mod handlers;
mod sys;

use std::os::fd::FromRawFd;
use std::os::unix::net::{UnixListener, UnixStream};
use std::time::Instant;

pub static mut BOOT: Option<Instant> = None;

fn main() {
    // Also installed as /usr/local/bin/fusermount{,3} (see fuse.rs).
    let args: Vec<String> = std::env::args().collect();
    if let Some(n) = args.first().and_then(|a| std::path::Path::new(a).file_name()).and_then(|n| n.to_str()) {
        if n == "fusermount" || n == "fusermount3" {
            std::process::exit(fuse::main(&args));
        }
    }
    // SAFETY: single-threaded at this point.
    unsafe { BOOT = Some(Instant::now()) };
    if std::process::id() == 1 {
        sys::init_system();
        loop {
            match unsafe { libc::fork() } {
                0 => break, // child: become the server
                -1 => {
                    eprintln!("jasmine-agent: fork failed");
                    std::thread::sleep(std::time::Duration::from_millis(100));
                }
                server => sys::reap_until(server),
            }
            // Server died: respawn it (we stay PID 1; the kernel panics if init exits).
            eprintln!("jasmine-agent: server exited, restarting");
        }
    }
    serve();
}

fn serve() -> ! {
    if let Ok(path) = std::env::var("JASMINE_AGENT_UNIX") {
        let _ = std::fs::remove_file(&path);
        let l = UnixListener::bind(&path).expect("bind unix");
        eprintln!("jasmine-agent: listening on unix:{path}");
        for conn in l.incoming().flatten() {
            spawn_conn(conn);
        }
        unreachable!()
    }
    let fd = sys::vsock_listen(jasmine_proto::AGENT_PORT).expect("vsock listen");
    loop {
        let c = unsafe { libc::accept4(fd, std::ptr::null_mut(), std::ptr::null_mut(), libc::SOCK_CLOEXEC) };
        if c < 0 {
            continue;
        }
        // A vsock stream fd behaves like any stream socket for read/write.
        spawn_conn(unsafe { UnixStream::from_raw_fd(c) });
    }
}

fn spawn_conn(conn: UnixStream) {
    std::thread::Builder::new()
        .stack_size(256 << 10)
        .spawn(move || {
            if let Err(e) = handlers::handle(conn) {
                eprintln!("jasmine-agent: connection error: {e}");
            }
        })
        .ok();
}
