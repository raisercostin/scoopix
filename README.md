# Scoopix – Scoop-style installer for Linux, Synology & Entware

**Scoopix** is a lightweight, bucket-based installer for command-line tools, inspired by [Scoop](https://scoop.sh/) on Windows but designed for Linux, Synology NAS, Entware, WSL, and other Unix-like systems.

It installs tools in **user space** (no root required) and organizes them under `~/.scoopix`.
This makes it perfect for systems where you don’t want or can’t use `apt`, `opkg`, `snap`, or system-wide package managers.

## ✨ Features

- **Bucket system** – JSON manifests define how apps are downloaded, extracted, or built.
- **User-local installs** – binaries go under `~/.scoopix`, isolated from system packages.
- **Cross-platform** – runs on Linux, WSL2, Synology DSM, Entware, and more.
- **Source builds via Docker** – if no binary is available, Scoopix can build from source inside a Docker container.
- **Synology WireGuard from source** – one command can build the `wg` userspace tool and a Synology WireGuard kernel-module SPK instead of relying on an opaque third-party package.
- **Architecture awareness** – manifests can provide `x86_64`, `aarch64`, `armv7` variants.
- **Cache support** – downloads and Docker builds are cached; can be bypassed with `--ignore-download-cache` or `--ignore-build-cache`.
- **Shims directory (`~/.scoopix/bin`)** – added to `PATH`, just like Scoop’s `shims`.
- **Man page support** – installs `man` pages into `~/.scoopix/share/man`.

## 📂 Directory Layout

```
~/.scoopix/
  ├── apps/       # per-app, per-version installs
  │   └── micro/2.0.13/bin/micro
  ├── bin/        # shims → apps/<name>/current/bin/<binary>
  ├── buckets/    # user buckets (JSON manifests)
  ├── cache/      # downloaded tarballs, source archives
  ├── share/man/  # installed man pages
  └── temp/       # build/extraction scratch, symlinked to temp, usually clean
```

## Install Scoopix

```bash
echo install deno - see https://docs.deno.com/runtime/getting_started/installation/
curl -fsSL https://deno.land/install.sh | sh

echo run scoopix without installing
deno run https://raw.githubusercontent.com/raisercostin/scoopix/main/scoopix.ts
> usage...

echo run scoopix --version without installing
deno run --allow-env https://raw.githubusercontent.com/raisercostin/scoopix/main/scoopix.ts --version
> ✅ Granted env access to "HOME".
> scoopix 0.1.0

echo install scoopix and check version
deno install --global  --allow-net --allow-run --allow-read --allow-write --allow-env https://raw.githubusercontent.com/raisercostin/scoopix/main/scoopix.ts
scoopix --version
> scoopix 0.1.0

echo configure path and manpath
scoopix init
```

## 🛠 Usage

```bash
scoopix
Usage:   scoopix
Version: 0.1.0

Description:

  Scoop like installer for Linux - user space, buckets, user light contributions

Options:

  -h, --help     - Show this help.
  -V, --version  - Show the version number for this program.
  -v, --verbose  - Increase verbosity
  -q, --quiet    - Decrease verbosity

Commands:

  install      <app>    - Install an app from all buckets
  uninstall    <app>    - Uninstall an app
  bucket                - Manage buckets
  list                  - List all apps in all buckets
  init         [shell]  - Configure PATH in shell rc file
  system-info           - Show system architecture and distribution
```

### Example: Install `micro` editor on Synology/Entware

1. Add a bucket
```bash
$ scoopix bucket add https://raw.githubusercontent.com/raisercostin/scoopix/main/scoopix-main.json main
Added bucket 'main' -> https://raw.githubusercontent.com/raisercostin/scoopix/main/scoopix-main.json
```

2. List apps

```bash
$ scoopix list
main/fd - A simple, fast and user-friendly alternative to 'find'
main/rhash - Utility for computing and verifying hash sums
main/micro - A terminal-based text editor that feels like a modern IDE
```

3. Install micro:

```bash
scoopix install main/micro
```

4. Run it:

```bash
micro
```

### Example: Install `rhash` from source

```bash
scoopix install dev/rhash
```

Scoopix will:

* Download the source tarball (cached under `~/.scoopix/cache`).
* Use Docker (`alpine:edge`) to build a static binary.
* Copy the built `rhash` into `~/.scoopix/apps/rhash/<version>/bin`.
* Create a shim at `~/.scoopix/bin/rhash`.

### Example: WireGuard on Synology

This guide describes the path validated on a Synology DS920+ class NAS running DSM 7.x. It installs the WireGuard userspace tool, builds/installs the Synology kernel module package, and tests a real remote peer without taking over LAN or internet routing.

#### What This Installs

Scoopix installs two pieces:

- `wg`: the WireGuard userspace configuration tool, installed under `~/.scoopix/bin/wg`.
- `wireguard-kmod-spk`: a Synology SPK that loads the WireGuard kernel module.

The combined package is:

```sh
dev/wireguard:1.0.20220627-dsm7.2 - WireGuard userspace tools and Synology kernel module
```

The important part: this is a one-command, source-based Synology WireGuard path. Scoopix builds the userspace `wg` binary from `wireguard-tools`, builds the Synology kernel-module SPK in Docker with Synology toolkit tarballs for the detected DSM/platform, and uses the open `vegardit/synology-wireguard` packaging/build recipe as the base instead of downloading an opaque binary SPK.

#### Prerequisites

On the Synology:

- Deno installed.
- Docker/Container Manager available for building the SPK.
- Root access through `sudo`.
- Router UDP port forwarding for the final peer test, for example:

```text
UDP 51820 -> <nas-lan-ip>:51820
```

#### Install

Build or reuse the artifacts as the normal user:

```sh
deno run --allow-read --allow-write --allow-net --allow-env --allow-run scoopix-dev.ts install dev/wireguard
```

Run the system install/start step with root:

```sh
sudo deno run --allow-read --allow-write --allow-net --allow-env --allow-run scoopix-dev.ts install dev/wireguard --system
```

Expected installed-state output on later runs:

```text
Already installed: dev/wireguard:1.0.20220627-dsm7.2 - WireGuard userspace tools and Synology kernel module
```

#### Safe Local Tests

`test1` verifies that a temporary WireGuard interface can be created without changing the default route:

```sh
sudo deno run --allow-read --allow-write --allow-net --allow-env --allow-run scoopix-dev.ts run dev/wireguard test1
```

`test2` creates two temporary local WireGuard peers on the NAS, observes a handshake, verifies the default route is unchanged, and cleans up:

```sh
sudo deno run --allow-read --allow-write --allow-net --allow-env --allow-run scoopix-dev.ts run dev/wireguard test2
```

#### Remote Peer Test

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
sudo deno run --allow-read --allow-write --allow-net --allow-env --allow-run scoopix-dev.ts run dev/wireguard test3
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

#### Troubleshooting

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

#### Cleanup

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

#### Toward a Permanent VPN Server

The validated test proves that WireGuard works, but a permanent VPN server needs a few more pieces.

#### Persistent Server Config

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

#### Startup And Shutdown

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

#### Router And Firewall

Keep the router rule:

```text
UDP 51820 -> <nas-lan-ip>:51820
```

On Synology, allow inbound UDP `51820` if DSM firewall is enabled.

For server-only access, no NAT is needed. For LAN access, add client routes and firewall rules deliberately:

```ini
AllowedIPs = 10.254.253.1/32, 192.168.1.0/24
```

Then enable forwarding and add firewall/NAT rules only if required by the LAN design. Do this after the narrow server-only tunnel is stable.

#### Peer Management

Each client should have its own key pair and its own tunnel IP:

```text
phone      10.254.253.2/32
laptop     10.254.253.3/32
tablet     10.254.253.4/32
```

Server peers should use exact `/32` `AllowedIPs` per client. Do not reuse client private keys.

#### Operational Checks

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

#### Backup

Back up the permanent config and keys securely:

```text
/usr/local/etc/wireguard/wg0.conf
server private key
client public keys
client configs, if generated on the NAS
```

Treat private keys as secrets. If a client is lost, remove that peer from the server config and create a new key pair for the replacement device.

## 📖 History

* **2025-09-07** – v0.1.0 - Initial release inspired by Scoop, focused on Synology/Entware.
* Added features:
  * Source builds via Docker
  * Architecture-aware manifests
  * Caching (downloads, Docker images)
  * Man page installation
  * Portable mode (`SCOOPIX_HOME` override).
  * Logging (`-v`/`-vvv` verbosity and `-q`/`-qq` quiet).

## 📝 To-Do

* [ ] Improve archive auto-detection (`tar.gz`, `zip`).
* [ ] Add hash checking support (like Scoop).
* [ ] Distributed buckets (community buckets).
* [ ] Add upgrade/uninstall commands.
* [ ] Tests and CI integration.
* [ ] More modern tools in synology: gdu, bat, iotop, rg/ripgrep, ag, duf, fzf, plocate, zstd

## 🙏 Thanks

* Inspired by [Scoop](https://scoop.sh/), the minimal Windows package manager.
* Built on [Deno](https://deno.land/), a sane and modern runtime for typescript language.
* Thanks to the open-source tools that Scoopix installs: `fd`, `rhash`, `micro`, and many more.
* Thanks to Synology/Entware/WSL communities for motivating a **rootless, portable installer**.

> **Scoopix – portable, user-friendly installs for systems where apt/opkg/ipkg/snap don’t fit.**
