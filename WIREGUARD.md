# WireGuard on Synology with Scoopix

This guide describes the path validated on a Synology DSM 7.x NAS. It installs the WireGuard userspace tool, builds/installs the Synology kernel module package, and tests a real remote peer without taking over LAN or internet routing.

## What This Installs

Scoopix installs two pieces:

- `wg`: the WireGuard userspace configuration tool, installed under `~/.scoopix/bin/wg`.
- `wireguard-kmod-spk`: a Synology SPK that loads the WireGuard kernel module.

The combined package is:

```sh
main/wireguard:1.0.20220627-dsm7.2 - WireGuard userspace tools and Synology kernel module
```

The important part: this is a one-command, source-based Synology WireGuard path. Scoopix builds the userspace `wg` binary from `wireguard-tools`, builds the Synology kernel-module SPK in Docker with Synology toolkit tarballs for the detected DSM/platform, and uses the open `vegardit/synology-wireguard` packaging/build recipe as the base instead of downloading an opaque binary SPK.

## Prerequisites

On the Synology:

- Deno installed.
- Docker/Container Manager available for building the SPK.
- Root access through `sudo`.
- Router UDP port forwarding for the final peer test, for example:

```text
UDP 51820 -> <nas-lan-ip>:51820
```

## Install

After `scoopix` is installed with Deno permissions, install everything in one line:

```sh
scoopix install main/wireguard && sudo scoopix install main/wireguard --system
```

If running directly from a source checkout, build or reuse the artifacts as the normal user:

```sh
deno run --allow-read --allow-write --allow-net --allow-env --allow-run scoopix.ts install main/wireguard
```

Run the system install/start step with root:

```sh
sudo deno run --allow-read --allow-write --allow-net --allow-env --allow-run scoopix.ts install main/wireguard --system
```

Expected installed-state output on later runs:

```text
Already installed: main/wireguard:1.0.20220627-dsm7.2 - WireGuard userspace tools and Synology kernel module
```

## Safe Local Tests

`test1` verifies that a temporary WireGuard interface can be created without changing the default route:

```sh
sudo scoopix run main/wireguard test1
```

`test2` creates two temporary local WireGuard peers on the NAS, observes a handshake, verifies the default route is unchanged, and cleans up:

```sh
sudo scoopix run main/wireguard test2
```

## Remote Peer Test

Use a dedicated high UDP port. We validated `51820`.

Router rule:

```text
Protocol: UDP
External port: 51820
Internal IP: <nas-lan-ip>
Internal port: 51820
```

Create or restore the last known-good test server:

```sh
sudo scoopix run main/wireguard test3
```

The test server uses:

```text
Interface: wg-peer-test
NAS tunnel IP: 10.254.253.1/24
Client tunnel IP: 10.254.253.2/32
Listen port: 51820/UDP
Keys directory: /root/wg-peer-test
```

Client config should use:

```ini
[Interface]
PrivateKey = <contents of /root/wg-peer-test/client.key>
Address = 10.254.253.2/32

[Peer]
PublicKey = <contents of /root/wg-peer-test/server.pub>
Endpoint = <public-hostname>:51820
AllowedIPs = 10.254.253.1/32
PersistentKeepalive = 25
```

From the remote client:

```sh
ping 10.254.253.1
```

Pass criteria:

```text
Reply from 10.254.253.1
latest handshake appears in wg show wg-peer-test
default NAS route still goes via <router-lan-ip> dev <lan-interface>
```

## Troubleshooting

Check the NAS listener:

```sh
~/.scoopix/bin/wg show wg-peer-test
cat /proc/net/udp /proc/net/udp6 | grep ':CA6C'
```

`CA6C` is port `51820` in hex.

If the client sends handshakes but the NAS shows no `latest handshake`, capture packets on the NAS:

```sh
tcpdump -ni any udp port 51820
```

If packets appear, router forwarding works and the problem is likely keys/config. If packets do not appear, fix router UDP forwarding or firewall rules.

## Cleanup

Remove temporary interfaces only:

```sh
sudo ip link delete wg-safety 2>/dev/null || true
sudo ip link delete wg-safety-a 2>/dev/null || true
sudo ip link delete wg-safety-b 2>/dev/null || true
sudo ip link delete wg-scoopix-test 2>/dev/null || true
```

Do not delete `wg-peer-test` if you want the temporary server to stay running. To stop it:

```sh
sudo ip link delete wg-peer-test
```

This setup is not persistent across reboot yet. The next step is to turn the known-good `wg-peer-test` configuration into a persistent Synology startup path.

## Toward a Permanent VPN Server

The validated test proves that WireGuard works, but a permanent VPN server needs a few more pieces.

## Persistent Server Config

Create a stable config directory, for example:

```sh
sudo mkdir -p /usr/local/etc/wireguard
sudo chmod 700 /usr/local/etc/wireguard
```

Move from test names to a real interface name, usually `wg0`:

```ini
[Interface]
PrivateKey = <server private key>
Address = 10.254.253.1/24
ListenPort = 51820

[Peer]
PublicKey = <client public key>
AllowedIPs = 10.254.253.2/32
```

Keep client `AllowedIPs` narrow at first:

```ini
AllowedIPs = 10.254.253.1/32
```

That allows the client to reach only the VPN server tunnel IP. Do not use `0.0.0.0/0` until you explicitly want full-tunnel internet routing.

## Startup And Shutdown

The current test interface is created with `ip link` and disappears after reboot. A permanent setup needs Synology startup integration:

- load/start the WireGuard package after boot,
- create `wg0`,
- apply the config,
- assign the tunnel address,
- bring the interface up,
- remove the interface cleanly on shutdown.

A Scoopix-managed system script can do this with the same primitives already tested:

```sh
ip link add dev wg0 type wireguard
ip address add 10.254.253.1/24 dev wg0
wg setconf wg0 /usr/local/etc/wireguard/wg0.conf
ip link set up dev wg0
```

Shutdown:

```sh
ip link delete wg0
```

## Router And Firewall

Keep the router rule:

```text
UDP 51820 -> <nas-lan-ip>:51820
```

On Synology, allow inbound UDP `51820` if DSM firewall is enabled.

For server-only access, no NAT is needed. For LAN access, add client routes and firewall rules deliberately:

```ini
AllowedIPs = 10.254.253.1/32, <lan-cidr>
```

Then enable forwarding and add firewall/NAT rules only if required by the LAN design. Do this after the narrow server-only tunnel is stable.

## Peer Management

Each client should have its own key pair and its own tunnel IP:

```text
phone      10.254.253.2/32
laptop     10.254.253.3/32
tablet     10.254.253.4/32
```

Server peers should use exact `/32` `AllowedIPs` per client. Do not reuse client private keys.

## Operational Checks

Basic health checks:

```sh
wg show wg0
ip address show wg0
ip route get 1.1.1.1
```

Expected:

```text
latest handshake appears for active clients
transfer counters increase
default NAS route remains via <router-lan-ip> dev <lan-interface>
```

## Backup

Back up the permanent config and keys securely:

```text
/usr/local/etc/wireguard/wg0.conf
server private key
client public keys
client configs, if generated on the NAS
```

Treat private keys as secrets. If a client is lost, remove that peer from the server config and create a new key pair for the replacement device.
