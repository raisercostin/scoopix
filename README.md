# Scoopix - bucket-driven installs for tools, artifacts, and source builds

**Scoopix** is a small package installer for command-line tools and operational artifacts. It keeps the useful parts of [Scoop](https://scoop.sh/) - buckets, manifests, per-version installs, and shims - but is designed to run from a single Deno script across Linux, Synology NAS, Entware, WSL, Git Bash, and Windows-aware workflows.

The core idea is simple: a bucket is a JSON catalog, each app describes where its artifact or source comes from, and Scoopix installs it into **user space** under `~/.scoopix` instead of mutating system package state. That makes it useful on machines where `apt`, `opkg`, `snap`, Homebrew, or administrative installs are unavailable, too heavy, or too global.

Scoopix has evolved from "Scoop for Synology/Linux" into a more general installer layer:

- It can install downloaded binaries, extracted application trees, source-built binaries, delegated recipes, system-assisted packages, and metadata-like packages such as shell configuration or future completion targets.
- It separates package identity from upstream version discovery. A manifest can pin a known-good bucket version while `versionsFinder` discovers newer or older upstream versions on demand.
- It supports exact version installs with `app@version` and `--version`, force reinstalls, cached downloads, and local bucket manifest updates when you intentionally want to persist a resolved version.
- It supports direct installs from local single-file Rust sources such as `./sudo.rs` without requiring a bucket entry.
- It separates package identity from command names with `--name`, `--as`, and `--shim-prefix` for collision-safe installs.
- It treats buckets as editable infrastructure. A local bucket can be a project file, a Git repo, or a remote raw JSON file; Scoopix can use the loaded bucket, source discovery, and local Git history as separate version lanes.
- It is intentionally user-local by default, but can run selected system operations when a package explicitly needs them, such as Synology WireGuard installation.

Think of Scoopix less as a distro package manager and more as a portable installer substrate: a way to describe how a tool is obtained, built, exposed on `PATH`, upgraded, pinned, tested, and repeated across constrained machines.

Longer-term, Scoopix should move toward URL-first packages with conventions. A package can be a URL to an archive, a Git repository, or a single source file; Scoopix can infer common builders and metadata when the source carries enough convention, while buckets remain catalogs and override layers. This is similar in spirit to Zig's package model: a package is a URL plus conventional build/metadata files when present. For Scoopix, future conventions might include `scoopix.json`, common files such as `build.zig`, `Cargo.toml`, `deno.json`, `Makefile`, or friendly single-file scripts with detectable versions.

## ✨ Features

- **Bucket system** – JSON manifests define how apps are downloaded, extracted, or built.
- **User-local installs** – binaries go under `~/.scoopix`, isolated from system packages.
- **Cross-platform** – runs on Linux, WSL2, Synology DSM, Entware, and more.
- **Version lanes** – installed, saved, bucket, source-discovered, and git-backed bucket history can be inspected separately.
- **Exact versions** – install or upgrade with `bucket/app@version` or `--version` when a manifest has `versionsFinder`.
- **Direct source installs** – install a local single-file Rust source directly with `scoopix install ./tool.rs`.
- **Source builds via Docker** – if no binary is available, Scoopix can build from source inside a Docker container.
- **Artifact-shaped installs** – packages can preserve extracted trees and expose several command shims from one archive.
- **Synology WireGuard from source** – one command can build the `wg` userspace tool and a Synology WireGuard kernel-module SPK instead of relying on an opaque third-party package.
- **Architecture awareness** – manifests can provide `x86_64`, `aarch64`, `armv7` variants.
- **Cache support** – downloads and Docker builds are cached; can be bypassed with `--ignore-download-cache`, `--ignore-build-cache`, or `--force`.
- **Shims directory (`~/.scoopix/bin`)** – holds app command shims, just like Scoop’s `shims`.
- **Command aliases** – install one package under a different command name with `--as`, or namespace all shims with `--shim-prefix`.
- **Man page support** – installs `man` pages into `~/.scoopix/share/man`.

## Install / Dev Usage

Use `deno install` instead of wrapper scripts. Install Deno first with the official instructions: https://docs.deno.com/runtime/getting_started/installation/. On Unix-like systems, the quick installer is `curl -fsSL https://deno.land/install.sh | sh`.

Source: https://github.com/raisercostin/scoopix/blob/main/scoopix.ts

- Public one-shot:

  ```bash
  deno run --allow-all https://github.com/raisercostin/scoopix/raw/refs/heads/main/scoopix.ts --version
  ```

- Public install:

  ```bash
  deno install --allow-all --force --name=scoopix https://github.com/raisercostin/scoopix/raw/refs/heads/main/scoopix.ts
  scoopix --version
  ```

- Dev install:

  ```bash
  deno install --allow-all --force --name=scoopix $PWD/scoopix.ts
  scoopix --version
  ```

- Dev local:

  ```bash
  deno run --allow-all scoopix.ts --version
  ```

- Suggested development bucket:

  ```bash
  scoopix bucket add ./scoopix-main.json dev
  ```

After installing, check the bundled bucket:

```bash
scoopix list
main/fd - A simple, fast and user-friendly alternative to 'find'
main/rhash - Utility for computing and verifying hash sums
main/micro - A terminal-based text editor that feels like a modern IDE
main/arangodb - ArangoDB - a multi-model database
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
  reinstall    <app>    - Reinstall the current app version or source identity
  downgrade    <app>    - Install an explicit older app version
  switch       <app>    - Switch current symlink to an already installed version
  cleanup      <app>    - Remove old installed versions while keeping current
  pin          <app>    - Pin current or explicit app version
  unpin        <app>    - Remove app pin
  fetch        [target] - Fetch configured bucket metadata without changing installed apps
  update       [target] - Compatibility alias for fetch
  uninstall    <app>    - Uninstall an app
  config                - Configure Scoopix
  bucket                - Manage buckets
  list                  - List installed apps; use --all for bucket catalog apps
  search                - Search configured bucket catalog apps
  available             - List available bucket catalog apps, optionally filtered
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

### Avoid command-name collisions

Use `--as` when a package command would collide with an existing utility. On Windows, if the package binary is `.exe`, Scoopix keeps the installed shim executable-friendly, so this installs `sudo2.exe` and `sudo2` works from Git Bash:

```bash
scoopix install main/sudo --as sudo2 --approve-rustc-build
sudo2 --help
```

Use `--shim-prefix` when a package exposes several commands and you want all shims namespaced:

```bash
scoopix install main/arangodb --shim-prefix arango-
```

After uninstalling a command, Bash can keep a stale command-path cache for the current terminal. If it still tries a removed `~/.scoopix/bin/...` path, run:

```bash
hash -r
```

### Direct Local Rust Installs

Install a local single-file Rust program directly, without adding it to a bucket:

```bash
scoopix install ../scripts/sudo.rs --approve-rustc-build
sudo --version
```

For generic file names or development variants, use `--name` to set the package identity and `--as` to set the command exposed on `PATH`:

```bash
scoopix install ../scripts/sudo.rs --name sudo-dev --as sudo2 --approve-rustc-build
sudo2 --version
```

Direct local Rust installs are normal installs. Scoopix records the original source path in app provenance, copies the current source bytes into `~/.scoopix/cache/direct-sources`, derives the installed version from the source-declared version plus source identity, builds that cached copy, and leaves previous versions under `~/.scoopix/apps/<name>/<version>`.

For local files inside a Git worktree, the version is anchored to the current commit and the exact source snapshot hash:

```text
<formal-version>-<commit-date>.<commit-count>.<branch>.g<commit>.h<source-hash>
```

For local files outside Git, the version uses file mtime plus the exact source snapshot hash:

```text
<formal-version>-<mtime-utc>.h<source-hash>
```

`g...` always means Git commit, and `h...` always means source content hash. Build-specific facts such as build time, builder host, `rustc` version, and cached source path are kept in `scoopix info <name>` provenance instead of the package version.

After editing the source file, refresh the installed package by app identity without repeating the source path:

```bash
scoopix upgrade sudo-dev --approve-rustc-build
sudo2 --version
```

Use `--ignore-build-cache` if you need to rebuild the same source version even when the source hash did not change. In Scoopix, `fetch` refreshes configured bucket metadata, `bucket apply <app> <version>` mutates a local bucket manifest, and `upgrade <name>` makes an installed package current from its known source. Future live installs are planned separately for source paths that should rebuild automatically when the command is run.

Use `--live` to mark a direct local source as intentionally followed by path. It records `source mode: live` in provenance; refresh still happens explicitly through `upgrade <name>`:

```bash
scoopix install --live ../scripts/rtee.rs --name rteel --as rteel --approve-rustc-build
scoopix upgrade rteel --approve-rustc-build
```

### Upgrade and version selection

Scoopix separates three responsibilities:

- Using apps: `install`, `upgrade`, `reinstall`, `downgrade`, `switch`, `cleanup`, `uninstall`, `pin`, `unpin`, `versions`, and `info`.
- Using buckets: `fetch`, `search`, `available`, `list --all`, `bucket add`, `bucket remove`, and `bucket list`.
- Maintaining buckets: `bucket discover`, `bucket apply`, `bucket import`, `bucket ignore`, `bucket test`, `bucket commit`, `bucket push`, `bucket reset`, and `bucket lint`.

Use `list` to show installed apps:

```bash
scoopix list
scoopix installed
```

Use `list --all`, `search`, or `available` to inspect configured bucket catalog apps:

```bash
scoopix list --all
scoopix search rtee
scoopix available rtee
```

Use `fetch` to refresh configured bucket metadata without changing installed apps:

```bash
scoopix fetch
scoopix bucket fetch dev
```

`upgrade` is the normal user command for making an app current:

```bash
scoopix upgrade micro
```

Use `reinstall` to rebuild or reinstall the current selected version/source identity:

```bash
scoopix reinstall rteel --approve-rustc-build
```

Use `switch` to select an already installed version without downloading/building a new one:

```bash
scoopix switch rteel@0.1.7-20260824.196.main.g2d47908.h037203ec61f6
```

Use `cleanup` to remove old installed version directories while keeping the current version:

```bash
scoopix cleanup rteel
```

Use `pin` to pin the current or explicit version. Pinned apps are skipped by bulk `scoopix upgrade` until `unpin` removes the pin:

```bash
scoopix pin rteel
scoopix unpin rteel
```

By default, Scoopix uses the bucket manifest and, when the manifest has `versionsFinder`, resolves the latest upstream version without mutating the bucket file. Use `app@version` or `--version` to install an exact discovered version, including downgrades:

```bash
scoopix upgrade micro@2.0.15
scoopix upgrade micro --version 2.0.15
```

Use `versions` to see where version information comes from:

```bash
scoopix versions micro
```

It reports three sources: `installed`, `bucket`, and `source`. Bucket manifests may keep a bounded curated history, for example the last 3 major versions, 3 minor versions per major, and 3 patch versions per minor. When a bucket is local and git-backed, Scoopix can also recover older bucket versions from git history. `source` is realtime discovery from `versionsFinder`.

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

Use `--update-bucket-manifest` to persist the resolved version back into a local bucket manifest. This rewrites versioned artifact URLs and paths, but leaves `versionsFinder` unchanged:

```bash
scoopix upgrade micro@2.0.15 --update-bucket-manifest
```

For bucket maintenance, prefer `bucket apply` over the legacy top-level update form:

```bash
scoopix bucket discover main/rtee
scoopix bucket apply main/rtee 0.1.7
scoopix bucket lint main
```

`scoopix update` is a compatibility alias for `scoopix fetch`.

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

## Install Risk Model

Scoopix treats bucket manifests as executable install intent. A package may download a released binary, compile source locally, build inside Docker, or run delegated commands. These are not simply "safe" or "unsafe" categories; each path has a different trust chain.

The useful questions are: who produced this source or artifact, can its integrity be verified, can it be rebuilt from declared inputs, can the build path be understood, what permissions does it get, and who is accountable for it?

A precompiled binary asks you to trust the publisher's release process. That can be a strong trust signal when maintainers are reputable and publish stable artifacts, checksums, signatures, release notes, SBOMs, attestations, or reproducible-build evidence. The risk is that the final executable is harder to inspect directly, so trust depends on provenance, integrity checks, and maintainer practices.

A source build asks you to trust the declared source and the build environment. A locally compiled executable is not opaque merely because it is compiled: if the source, dependencies, compiler, build flags, and build steps are known, the executable is the result of those inputs. The risk is compositional: source behavior, dependencies, build scripts, compiler/toolchain, platform libraries, and runtime permissions all contribute.

Simple source builds are easier to reason about. A single-file Rust program compiled with `rustc` and no external dependencies has a smaller trust surface than a project that downloads dependencies, runs build scripts, generates code, or invokes arbitrary shell commands. Complex source builds can hide behavior in dependency trees, build hooks, generated artifacts, or platform-specific tooling.

Docker builds add isolation and repeatability, but they add another trust boundary: the container image, Docker daemon, mounted paths, network access, and commands run inside the container. Docker is useful for containing build dependencies, not a guarantee that the result is safe.

Delegated shell commands are the highest-risk installer path because the manifest can directly run arbitrary commands. They should be reviewed like scripts you would paste into a terminal.

Scoopix uses explicit approval flags to make these trust decisions visible. For example, `--approve-rustc-build` means: "I reviewed enough of this source/build path to allow Scoopix to compile it and place the resulting executable on my `PATH`."

```bash
scoopix install main/rtee --approve-rustc-build
```

The safest install path is not determined by whether the package starts as source or binary, but by how much of the chain from author to executable is inspectable, verifiable, reproducible, and constrained.

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

## FAQ

### Should Scoopix follow the XDG Base Directory Specification?

Scoopix keeps the Scoop-style install root as the default instead of splitting files across the [XDG Base Directory Specification](https://specifications.freedesktop.org/basedir/latest/#index). The default layout is intentionally portable and inspectable:

```text
~/.scoopix/
  apps/
  bin/
  buckets/
  cache/
  temp/
  state/
  share/man/
```

This fits Scoopix's goals across Linux, Synology, Entware, WSL, Git Bash, and Windows-adjacent workflows. A single root is easy to copy, delete, back up, inspect, and reason about on constrained systems. It also preserves the Scoop mental model: one home, per-version app directories, a `current` link, cache, buckets, state, and shims in a predictable place.

XDG is still useful for users who want freedesktop-style integration. It should be treated as an opt-in layout, not the default. `SCOOPIX_HOME` should continue to override everything because it is the clean portable mode.

A future `SCOOPIX_XDG=1` mode could map paths like this:

```text
apps        -> $XDG_DATA_HOME/scoopix/apps
buckets     -> $XDG_CONFIG_HOME/scoopix/buckets or $XDG_DATA_HOME/scoopix/buckets
state       -> $XDG_STATE_HOME/scoopix
cache       -> $XDG_CACHE_HOME/scoopix
temp        -> $TMPDIR/scoopix or $XDG_CACHE_HOME/scoopix/temp
bin         -> $HOME/.local/bin or a configured Scoopix bin directory
man         -> $XDG_DATA_HOME/man or $XDG_DATA_HOME/scoopix/share/man
```

If the corresponding XDG variables are unset, the usual freedesktop defaults would apply, such as `$HOME/.local/share`, `$HOME/.config`, `$HOME/.local/state`, and `$HOME/.cache`.

An XDG mode should not change package semantics. `apps/<name>/<version>`, `current`, shims, cache, buckets, state, and provenance should behave the same regardless of layout. The layout choice should only affect where those directories live.

Practical policy: keep `~/.scoopix` as the default portable root, consider XDG as an opt-in layout later, and always make `scoopix config path` / `scoopix info` show the resolved paths.

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
* `install --as <name>` can expose the primary command under a different shim name, and `--shim-prefix <prefix>` can namespace every shim from multi-command packages.
* `uninstall` removes recorded Scoopix-owned shims, including aliased or prefixed shims, and reminds Bash users to run `hash -r` when a shell command cache points at a removed shim.
* `config path` configures both shell startup files and, on Windows, the Windows user `PATH`; `--remove` reverses only Scoopix PATH entries.
* `versionsFinder` discovers installable versions from GitHub releases, web indexes, multiple web regex sources, and Git file history.
* `upgrade micro` follows the installed owner bucket and can upgrade from upstream `versionsFinder`.
* `srcVersionDetector` can extract a formal source version and inject the derived build version into friendly source builds.
* `install main/rtee --approve-rustc-build` compiles a Git-backed single-file Rust source with local `rustc`, stores provenance, and installs the generated executable.
* `install ./tool.rs --approve-rustc-build` performs a direct local Rust source install without a bucket entry, caches the exact source bytes, derives a hash-based install version, and stores local source provenance.
* `info <app>` shows installed provenance such as Git commit, author, committer, signature status, builder, build time, user, and host when available.
* Archive installs can preserve extracted application trees and expose multiple shims, used by the Windows ArangoDB package.
* Manifest `healthcheck` can verify the installed target after install or upgrade.

Remaining work:

* Add a Scoop-style Windows `.exe` shim launcher plus `.shim` metadata for sidecar DLL, cwd, env, and argument handling.
* Add Docker-backed Rust/source builds behind an explicit `--approve-docker-build` trust gate.
* Add direct HTTP/Git URL installs for metadata-light single-file sources after direct local installs are solid.
* Add live source installs that follow a source path or URL and rebuild/delegate when the source changes.
* Add persisted approval records keyed by source URL, version, commit/hash, and build strategy.
* Add non-mutating/dry-run output for PATH configuration and removal.
* Expand automated tests around PATH config strategies and Windows registry updates.

## 📝 To-Do

* [ ] Improve archive auto-detection (`tar.gz`, `zip`).
* [ ] Add hash checking support (like Scoop).
* [ ] Add signature/checksum display in `info` for binary and source installs.
* [ ] Add `--approve-docker-build` and Docker fallback for Rust/source installs.
* [ ] Add direct `scoopix install <url>` for simple HTTP/Git/blob source URLs.
* [ ] Add `scoopix install --live <source>` for live Rust, TypeScript/Deno, Java/JBang, Nu, and similar script/source workflows.
* [ ] Explore URL-first package conventions so buckets can shrink to catalogs/overrides when upstream carries enough metadata.
* [ ] Distributed buckets (community buckets).
* [ ] Tests and CI integration.
* [ ] More modern tools in synology: gdu, bat, iotop, rg/ripgrep, ag, duf, fzf, plocate, zstd

## 🙏 Thanks

* Inspired by [Scoop](https://scoop.sh/), the minimal Windows package manager.
* Built on [Deno](https://deno.land/), a sane and modern runtime for typescript language.
* Thanks to the open-source tools that Scoopix installs: `fd`, `rhash`, `micro`, and many more.
* Thanks to Synology/Entware/WSL communities for motivating a **rootless, portable installer**.

> **Scoopix – portable, user-friendly installs for systems where apt/opkg/ipkg/snap don’t fit.**
