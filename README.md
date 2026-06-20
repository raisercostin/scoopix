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
- **Shims directory (`~/.scoopix/bin`)** – holds app command shims, just like Scoop’s `shims`.
- **Man page support** – installs `man` pages into `~/.scoopix/share/man`.

## Install Scoopix

Scoopix uses deno - The typescript runtime and toolchain.

```bash
echo install deno - see https://docs.deno.com/runtime/getting_started/installation/
curl -fsSL https://deno.land/install.sh | sh

echo run scoopix --version without installing
deno run --allow-env https://raw.githubusercontent.com/raisercostin/scoopix/main/scoopix.ts --version
> ✅ Granted env access to "HOME".
> scoopix 0.1.0

echo install scoopix and check version
deno install --global --allow-net --allow-run --allow-read --allow-write --allow-env https://raw.githubusercontent.com/raisercostin/scoopix/main/scoopix.ts
scoopix --version
> scoopix 0.1.0

$ scoopix list
main/fd - A simple, fast and user-friendly alternative to 'find'
main/rhash - Utility for computing and verifying hash sums
main/micro - A terminal-based text editor that feels like a modern IDE
main/wireguard - WireGuard userspace tools and Synology kernel module
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

  autotest              - Run built-in tests
  install      <app>    - Install an app from all buckets
  upgrade      [app]    - Upgrade one installed app, or all installed apps
  update       <app>    - Update a local bucket manifest entry
  uninstall    <app>    - Uninstall an app
  config                - Configure Scoopix
  bucket                - Manage buckets
  list                  - List all apps in all buckets
  installed             - List installed apps
  versions     <app>    - List installed, saved, bucket, and source versions
  checkver     <app>    - Check whether an app manifest is current
  system-info           - Show system architecture and distribution
```

Expose installed app commands such as `micro` on `PATH`:

```bash
scoopix config path
```

On Windows, this configures detected shell startup files and the Windows user `PATH` for future terminals. To change only shell startup files:

```powershell
scoopix config path --shell-only
```

The current terminal process is not changed by a completed child process. `config path` prints a shell-specific activation command, or open a new terminal after running it.

Remove Scoopix app commands from `PATH`:

```bash
scoopix config path --remove
```

### Example: Install `micro` editor on Synology/Entware

The default `main` bucket is configured automatically on first `list`, `install`, or package script run.
To override it manually:

```bash
$ scoopix bucket add https://github.com/raisercostin/scoopix/raw/refs/heads/main/scoopix-main.json main
Added bucket 'main' -> https://github.com/raisercostin/scoopix/raw/refs/heads/main/scoopix-main.json
```

Install micro:

```bash
scoopix install main/micro
```

Run it:

```bash
micro
```

### Upgrade and version selection

`upgrade` is the normal user command for making an app current:

```bash
scoopix upgrade micro
```

By default, Scoopix uses the bucket manifest and, when the manifest has `versionSource`, resolves the latest upstream version without mutating the bucket file. Use `app@version` or `--version` to install an exact discovered version, including downgrades:

```bash
scoopix upgrade micro@2.0.15
scoopix upgrade micro --version 2.0.15
```

Use `versions` to see where version information comes from:

```bash
scoopix versions micro
```

It reports three sources: `installed`, `bucket`, and `source`. Bucket manifests may keep a bounded curated history, for example the last 3 major versions, 3 minor versions per major, and 3 patch versions per minor. When a bucket is local and git-backed, Scoopix can also recover older bucket versions from git history. `source` is realtime discovery from `versionSource`.

Save preferred versions outside buckets when you want a portable list to share or move between machines:

```bash
scoopix save micro@2.0.15 --reason "preferred terminal editor"
scoopix saved
scoopix unsave micro@2.0.15
```

Saved versions live in `~/.scoopix/saved-versions.json`, separate from bucket manifests. Multiple versions may be saved for the same app, which is useful for tools such as Java where several versions are intentionally kept and switched between.

Use strict bucket mode when you want reproducible manifest-only installs:

```bash
scoopix upgrade micro --from-bucket
```

Use `--update-bucket-manifest` to persist the resolved version back into a local bucket manifest. This rewrites versioned artifact URLs and paths, but leaves `versionSource` unchanged:

```bash
scoopix upgrade micro@2.0.15 --update-bucket-manifest
```

Use `--force-bucket-update` to run `git pull --ff-only` for matching local git-backed buckets before resolving versions. Remote raw buckets are fetched when loaded.

### Example: Install `rhash` from source

```bash
scoopix install main/rhash
```

Scoopix will:

* Download the source tarball (cached under `~/.scoopix/cache`).
* Use Docker (`alpine:edge`) to build a static binary.
* Copy the built `rhash` into `~/.scoopix/apps/rhash/<version>/bin`.
* Create a shim at `~/.scoopix/bin/rhash`.

### Example: WireGuard on Synology

Scoopix can install WireGuard on Synology in one line after `scoopix` is installed with the Deno permissions it needs:

```sh
sudo scoopix install main/wireguard --system
```

This builds the `wg` userspace tool from `wireguard-tools`, builds the Synology kernel-module SPK in Docker using Synology toolkit tarballs for the detected DSM/platform, and uses the open `vegardit/synology-wireguard` packaging recipe instead of an opaque binary SPK.

See [WIREGUARD.md](WIREGUARD.md) for the full Synology install, test, router, client, and permanent-server notes.

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

Future Windows shim option: Scoopix currently uses simple shims in `~/.scoopix/bin`. A Scoop-style generic launcher plus adjacent `.shim` metadata may be added for Windows, especially for tools that need sidecar DLLs, a specific working directory, extra environment variables, or launcher-managed arguments.

## 📖 History

* **2026-06-15** – Added the full Synology WireGuard path: generic host/DSM doctor data, source-built `wireguard-tools`, source-built Synology kernel-module SPK, system install/start checks, safe local and remote peer tests, `wg` command metadata in `list`, automatic path/manpath initialization, automatic default `main` bucket setup, and one-line `sudo scoopix install main/wireguard --system`.
* **2025-09-07** – v0.1.0 - Initial release inspired by Scoop, focused on Synology/Entware.
* Added features:
  * Source builds via Docker
  * Architecture-aware manifests
  * Caching (downloads, Docker images)
  * Man page installation
  * Portable mode (`SCOOPIX_HOME` override).
  * Logging (`-v`/`-vvv` verbosity and `-q`/`-qq` quiet).

## Current Status

Working now:

* `install` creates versioned app installs, a stable `current` link, and command shims in `~/.scoopix/bin`.
* `config path` configures both shell startup files and, on Windows, the Windows user `PATH`; `--remove` reverses only Scoopix PATH entries.
* `upgrade micro` follows the installed owner bucket and can upgrade from upstream `versionSource`.
* Manifest `healthcheck` can verify the installed target after install or upgrade.

Remaining work:

* Add a Scoop-style Windows `.exe` shim launcher plus `.shim` metadata for sidecar DLL, cwd, env, and argument handling.
* Add non-mutating/dry-run output for PATH configuration and removal.
* Expand automated tests around PATH config strategies and Windows registry updates.

## 📝 To-Do

* [ ] Improve archive auto-detection (`tar.gz`, `zip`).
* [ ] Add hash checking support (like Scoop).
* [ ] Distributed buckets (community buckets).
* [ ] Tests and CI integration.
* [ ] More modern tools in synology: gdu, bat, iotop, rg/ripgrep, ag, duf, fzf, plocate, zstd

## 🙏 Thanks

* Inspired by [Scoop](https://scoop.sh/), the minimal Windows package manager.
* Built on [Deno](https://deno.land/), a sane and modern runtime for typescript language.
* Thanks to the open-source tools that Scoopix installs: `fd`, `rhash`, `micro`, and many more.
* Thanks to Synology/Entware/WSL communities for motivating a **rootless, portable installer**.

> **Scoopix – portable, user-friendly installs for systems where apt/opkg/ipkg/snap don’t fit.**
