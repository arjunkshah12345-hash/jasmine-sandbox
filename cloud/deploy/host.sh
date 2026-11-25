#!/bin/sh
# Turn a fresh Linux machine with /dev/kvm into a Jasmine Cloud sandbox host.
#
#   sudo HOST_KEY=<secret shared with the gateway> GATEWAY_IP=<gateway's IP> ./host.sh
#
# Optional: LISTEN_IP (default: this machine's first private IPv4, else 127.0.0.1
# for a single box that also runs the gateway), TEMPLATES ("name=image ..."),
# BROWSER_TEMPLATE (1 = also build the Chromium "browser" template; default 1),
# JASMINE_VERSION (release tag; must include --vm-uid-base, and --start for the browser template).
set -eu
: "${HOST_KEY:?set HOST_KEY to the same value as JASMINE_HOST_KEY on the gateway}"
[ "$(id -u)" = 0 ] || { echo "run as root" >&2; exit 1; }
[ -e /dev/kvm ] || { echo "no /dev/kvm: this machine cannot run microVMs (use bare metal or a VM with nested virtualization)" >&2; exit 1; }

LISTEN_IP=${LISTEN_IP:-$(ip -4 -o addr show scope global | awk '{print $4}' | cut -d/ -f1 | grep -E '^(10|172\.(1[6-9]|2[0-9]|3[01])|192\.168)\.' | head -1)}
LISTEN_IP=${LISTEN_IP:-127.0.0.1}
TEMPLATES=${TEMPLATES:-"default=python:3.12-slim node=node:22-bookworm-slim"}

curl -fsSL https://tryjasmine.dev/install | sh

install -d -m 700 /etc/jasmine
umask 077
cat > /etc/jasmine/env <<ENV
JASMINE_API_KEY=$HOST_KEY
JASMINE_LISTEN=$LISTEN_IP:7171
# Each microVM's VMM runs as an unprivileged uid, never root.
JASMINE_VM_UID_BASE=900000
JASMINE_NET_POOL=64
ENV

for t in $TEMPLATES; do
  echo "building template ${t%%=*} from ${t#*=}"
  jasmined build "${t%%=*}" "${t#*=}"
done

# Built-in "browser" template: a headless Chromium captured running in the snapshot, so CDP
# answers the moment a sandbox exists (sandbox.cdpUrl()). Customers can't build templates on
# Cloud, so this is how they get one. BROWSER_TEMPLATE=0 skips it.
if [ "${BROWSER_TEMPLATE:-1}" = 1 ]; then
  echo "building template browser from chromedp/headless-shell:stable"
  jasmined build browser chromedp/headless-shell:stable --mem-mib 2048 --ready-port 9222 \
    --start '/headless-shell/headless-shell --no-sandbox --disable-gpu --disable-dev-shm-usage --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222 --remote-allow-origins=* about:blank'
fi

# Only the gateway may reach the daemon.
if [ "$LISTEN_IP" != 127.0.0.1 ]; then
  : "${GATEWAY_IP:?set GATEWAY_IP so only the gateway can reach port 7171}"
  iptables -C INPUT -p tcp --dport 7171 -s "$GATEWAY_IP" -j ACCEPT 2>/dev/null || iptables -I INPUT -p tcp --dport 7171 -s "$GATEWAY_IP" -j ACCEPT
  iptables -C INPUT -p tcp --dport 7171 -j DROP 2>/dev/null || iptables -A INPUT -p tcp --dport 7171 -j DROP
fi

systemctl daemon-reload
systemctl enable --now jasmined
systemctl restart jasmined
sleep 2
curl -fsS "http://$LISTEN_IP:7171/healthz" >/dev/null && echo "host ready: http://$LISTEN_IP:7171 (add it to the gateway's JASMINE_HOSTS)"
