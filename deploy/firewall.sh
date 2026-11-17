#!/bin/bash
# server1's INPUT and OUTPUT policies are DROP. This lets the host reach the
# two leadcase services it proxies (app :3000 for Apache, n8n :5678 for
# tailscale serve) and accept their replies. Nothing else. Containers still
# cannot open new connections to the host.
# Idempotent: safe to run every minute (firewall reloads can wipe these).
set -euo pipefail
ensure() { iptables -C "$1" "${@:3}" 2>/dev/null || iptables -I "$1" "$2" "${@:3}"; }
ensure OUTPUT 1 -d 172.31.250.0/24 -o br-leadcase -p tcp -m multiport --dports 3000,5678 -j ACCEPT
ensure INPUT  2 -i br-leadcase -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
