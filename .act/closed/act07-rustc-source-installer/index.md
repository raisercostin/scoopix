# Change ch005: Rustc Source Installer

## Summary

Add a manifest-based source installer path for single-file Rust programs. The first implementation uses an existing local `rustc` and installs the generated executable through the normal Scoopix versioned app and shim layout.

## Decisions

- Use `type: "src"` for Rust source installs instead of a separate Rust package type.
- Select the local Rust compiler backend with a `rustc` manifest field.
- Require `--approve-rustc-build` before compiling downloaded Rust source.
- Do not implement Docker fallback yet; reserve that for a later `--approve-docker-build` path.
- Keep direct HTTP/Git URL Rust installs as future work after manifest-based and local-file installs are working.

## Rationale

Compiling a remote Rust file creates a native executable that runs with the user's permissions. This is similar in risk to package-manager build scripts, so Scoopix should make the trust boundary explicit instead of silently compiling downloaded source.

## Implementation

- Added `rustc` source backend metadata to `ScoopixApp`.
- Added `--approve-rustc-build` to `install` and `upgrade`.
- Added a local `rustc` build path that downloads/caches the `.rs` source, runs `rustc -O -o <dest>`, and links the generated executable.
- Added package-level `versionsFinder` metadata, including `git-log` version discovery for source files and multi `web-regex` discovery for split upstream indexes.
- Added single-URL Git source conventions: GitHub blob URLs are parsed as a convenience, and provider-agnostic `git+<repo-url>#<ref>:<path>` URLs can identify scripts from any Git host/protocol.
- Added derived Git install versions in the form `<declared-version>-<yyyymmdd>.<commit-count>.<ref>.g<short-sha>`.
- Added source replacement support and `srcVersionDetector`, which extracts the formal source version and by default replaces that captured version with the derived build version before compilation.
- Added installed app provenance metadata and `scoopix info <app>` for Git commit/build details.
- Added direct local `.rs` installs, for example `scoopix install ./sudo.rs --approve-rustc-build`, which cache exact source bytes and derive a hash-based install version without requiring a bucket entry.
- Added `scoopix upgrade <name>` support for direct local `.rs` installs; it refreshes from the recorded `sourceFile` provenance so the original path does not have to be supplied again.
- Changed direct local `.rs` version identity so `g...` only means Git commit and `h...` means exact source content hash. Git worktree installs use `<formal-version>-<commit-date>.<commit-count>.<branch>.g<commit>.h<source-hash>`; non-Git installs use `<formal-version>-<mtime-utc>.h<source-hash>`.
- Added install `--live` for direct local `.rs` installs to record `source mode: live` in provenance while keeping refresh explicit through `upgrade <name>`.
- Added artifact SHA-256 provenance for installed primary artifacts.
- Added `install --as <name>` and `install --shim-prefix <prefix>` so packages can avoid command-name collisions while preserving package identity.
- Updated uninstall to remove recorded Scoopix-owned shim state, including aliased and prefixed shims, and to suggest `hash -r` for stale Bash command caches.
- Added `main/rtee`, sourced from `https://github.com/raisercostin/scripts/blob/main/rtee.rs` with homepage `https://github.com/raisercostin/scripts/blob/main/rtee.md`.
- Added `main/sudo`, a Windows-only native Rust UAC elevation helper that installs as `sudo.exe`.

## Future Work

- Add Docker Rust builds behind a separate `--approve-docker-build` approval.
- Add a direct HTTP/Git URL install path for metadata-free single-file sources.
- Add live source installs that follow Rust, TypeScript/Deno, Java/JBang, Nu, and similar source/script paths and rebuild or delegate when the source changes.
- Consider persisted source/build approvals keyed by package URL, version, and hash.

## Resolution

Verified locally on Windows with an isolated `HOME`:

- `scoopix install main/rtee` fails without `--approve-rustc-build` and explains the trust boundary.
- `scoopix install main/rtee --approve-rustc-build` compiles the downloaded Rust source with local `rustc`.
- The generated executable is installed under the versioned app layout and linked through `~/.scoopix/bin/rtee`.
- The manifest healthcheck passes with `rtee 0.1.0`.
- `scoopix versions main/rtee` lists the Git-log derived source version for commits that touched `rtee.rs`.
- `scoopix install main/rtee --version 0.1.0-20260816.189.main.g73121a4 --approve-rustc-build --force` checks out that commit and builds it.
- `scoopix info main/rtee` prints source URL, ref, path, full commit, commit date/count, author, committer, signature status, builder, rustc version, build time, and build user/host.
- `scoopix install main/sudo --approve-rustc-build` builds `sudo.exe`, and `rtee sudo <command>` can spawn it as a native executable.
- `scoopix install ./tool.rs --name direct-smoke --as direct-smoke-test --approve-rustc-build --no-autoconfig` builds a direct local Rust source install from a cached source copy and runs the generated command.
- `scoopix upgrade rteel-test --approve-rustc-build` refreshes a direct local Rust source install from the source path recorded during install.
