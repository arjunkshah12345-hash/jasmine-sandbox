#!/usr/bin/env bash
# Prepare a Linux KVM host for jasmined: Firecracker, guest kernel, crane, and an
# XFS (reflink) data directory. Idempotent. Run as root.
set -euo pipefail
ARCH="$(uname -m)"
DATA="${JASMINE_DATA:-/var/lib/jasmine}"
FC_VERSION="${FC_VERSION:-}"

[ -e /dev/kvm ] || { echo "no /dev/kvm: this host cannot run microVMs" >&2; exit 1; }

# Host tools: xfsprogs (reflink data dir), e2fsprogs (guest rootfs), iproute2 + iptables (networking).
missing=""
for t in mkfs.xfs mkfs.ext4 ip iptables curl tar; do command -v $t >/dev/null || missing="$missing $t"; done
if [ -n "$missing" ]; then
  if command -v apt-get >/dev/null; then
    DEBIAN_FRONTEND=noninteractive apt-get -qq update && DEBIAN_FRONTEND=noninteractive apt-get -qq install -y xfsprogs e2fsprogs iproute2 iptables curl tar >/dev/null
  elif command -v dnf >/dev/null; then
    dnf -q -y install xfsprogs e2fsprogs iproute iptables curl tar
  else
    echo "missing host tools:$missing (install them and rerun)" >&2; exit 1
  fi
fi
chmod 666 /dev/kvm || true

if ! command -v firecracker >/dev/null; then
  if [ -z "$FC_VERSION" ]; then
    FC_VERSION="$(basename "$(curl -fsSLI -o /dev/null -w '%{url_effective}' https://github.com/firecracker-microvm/firecracker/releases/latest)")"
  fi
  curl -fsSL "https://github.com/firecracker-microvm/firecracker/releases/download/${FC_VERSION}/firecracker-${FC_VERSION}-${ARCH}.tgz" | tar -xz -C /tmp
  install -m 0755 "/tmp/release-${FC_VERSION}-${ARCH}/firecracker-${FC_VERSION}-${ARCH}" /usr/local/bin/firecracker
fi
firecracker --version | head -1

if ! command -v crane >/dev/null; then
  GOARCH=$([ "$ARCH" = aarch64 ] && echo arm64 || echo x86_64)
  curl -fsSL "https://github.com/google/go-containerregistry/releases/latest/download/go-containerregistry_Linux_${GOARCH}.tar.gz" | tar -xz -C /usr/local/bin crane
fi

# rclone: copied into a sandbox the first time it mounts an S3 bucket (POST /v1/sandboxes/{id}/mounts).
# Optional: without it, everything except S3 mounts works.
RCLONE_VERSION="${RCLONE_VERSION:-v1.68.2}"
RCLONE=/usr/local/lib/jasmine/rclone
# (A function with explicit &&: `set -e` is ignored inside anything tested by `||`.)
install_rclone() {
  RARCH=$([ "$ARCH" = aarch64 ] && echo arm64 || echo amd64)
  Z="rclone-${RCLONE_VERSION}-linux-${RARCH}.zip"
  T="$(mktemp -d)" || return 1
  curl -fsSL -o "$T/$Z" "https://downloads.rclone.org/${RCLONE_VERSION}/$Z" &&
    curl -fsSL "https://downloads.rclone.org/${RCLONE_VERSION}/SHA256SUMS" | grep "  $Z\$" | (cd "$T" && sha256sum -c --status -) &&
    python3 -c 'import sys, zipfile; zipfile.ZipFile(sys.argv[1]).extract(sys.argv[2], sys.argv[3])' "$T/$Z" "${Z%.zip}/rclone" "$T" &&
    install -D -m 0755 "$T/${Z%.zip}/rclone" "$RCLONE"
  rc=$?; rm -rf "$T"; return $rc
}
if [ ! -x "$RCLONE" ]; then
  install_rclone || echo "warning: could not install rclone; S3 mounts will be unavailable" >&2
fi

# XFS with reflink so every sandbox disk is an O(1) copy-on-write clone.
mkdir -p "$DATA"
if [ "$(stat -f -c %T "$DATA")" != "xfs" ]; then
  IMG="${JASMINE_XFS_IMG:-/var/jasmine-xfs.img}"
  [ -f "$IMG" ] || { truncate -s "${JASMINE_XFS_SIZE:-20G}" "$IMG"; mkfs.xfs -q -m reflink=1 "$IMG"; }
  mount -o loop "$IMG" "$DATA"
fi

if [ ! -f "$DATA/vmlinux" ]; then
  # Firecracker's CI kernels. Path-style S3 URL (the bucket name has dots, which breaks TLS
  # with virtual-hosted URLs). Fall back to earlier minors if this release has none yet.
  MAJOR_MINOR="$(firecracker --version | head -1 | grep -oE '[0-9]+\.[0-9]+' | head -1)"
  MINOR="${MAJOR_MINOR#*.}"; KEY=""
  for m in $(seq "$MINOR" -1 10); do
    KEY="$(curl -fsSL "https://s3.amazonaws.com/spec.ccfc.min/?prefix=firecracker-ci/v1.${m}/${ARCH}/vmlinux-&list-type=2" \
      | grep -oE "firecracker-ci/v1\.${m}/${ARCH}/vmlinux-[0-9]+\.[0-9]+\.[0-9]{1,3}<" | tr -d '<' | sort -V | tail -1 || true)"
    [ -n "$KEY" ] && break
  done
  [ -n "$KEY" ] || { echo "could not find a Firecracker CI kernel" >&2; exit 1; }
  curl -fsSL -o "$DATA/vmlinux" "https://s3.amazonaws.com/spec.ccfc.min/${KEY}"
  echo "kernel: $KEY"
fi
echo "host ready: data=$DATA ($(stat -f -c %T "$DATA"))"
