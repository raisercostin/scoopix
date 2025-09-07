# Scoopix – Scoop-style installer for Linux, Synology & Entware

**Scoopix** is a lightweight, bucket-based installer for command-line tools, inspired by [Scoop](https://scoop.sh/) on Windows but designed for Linux, Synology NAS, Entware, WSL, and other Unix-like systems.  

It installs tools in **user space** (no root required) and organizes them under `~/.scoopix`.  
This makes it perfect for systems where you don’t want or can’t use `apt`, `opkg`, `snap`, or system-wide package managers.

## ✨ Features

- **Bucket system** – JSON manifests define how apps are downloaded, extracted, or built.
- **User-local installs** – binaries go under `~/.scoopix`, isolated from system packages.
- **Cross-platform** – runs on Linux, WSL2, Synology DSM, Entware, and more.
- **Source builds via Docker** – if no binary is available, Scoopix can build from source inside a Docker container.
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
