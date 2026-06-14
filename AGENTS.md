# Repository Guidelines

## Project Structure & Purpose

Scoopix is a Deno TypeScript CLI for Scoop-style, user-space installs on Linux, Synology, Entware, WSL, and similar systems. It installs under `~/.scoopix`, creates shims in `~/.scoopix/bin`, supports JSON buckets, and builds source packages through Docker.

The main files are `scoopix.ts` for CLI and installer logic, `scoopix-main.json` for the bundled bucket, and `README.md` for the user guide. There is no `src/` or `tests/` tree yet.

## Run, Inspect, and Smoke-Test

- `deno run --allow-net --allow-read --allow-write --allow-env --allow-run .\scoopix.ts --help` starts the CLI and prints commands.
- `deno run --allow-net --allow-read --allow-write --allow-env --allow-run .\scoopix.ts --version` prints `scoopix 0.1.0`.
- `deno run --allow-net --allow-read --allow-write --allow-env --allow-run .\scoopix.ts system-info` prints platform, architecture, and `uname`.
- `deno run --allow-net --allow-read --allow-write --allow-env --allow-run .\scoopix.ts bucket add .\scoopix-main.json main` registers the local bucket.
- `deno run --allow-net --allow-read --allow-write --allow-env --allow-run .\scoopix.ts -v list` lists apps with bucket-loading diagnostics.

For isolated tests, set `HOME` to a workspace temp directory. The current code derives `~/.scoopix` and the default `bin` directory from `HOME`.

## Coding Style & Naming

Use Deno TypeScript and keep changes close to the single-file structure unless extraction improves the installer. CLI commands are lowercase, with hyphenated names such as `system-info`. Bucket app keys are lowercase package names. Architecture keys include `x86_64`, `aarch64`, and `armv7`.

Manifest entries should show whether an app is binary (`type: "bin"`), source-built (`type: "src"` with Docker metadata), or command-delegated. Keep paths aligned with `apps/<name>/<version>`, `current`, `bin`, `cache`, `temp`, and `share/man`.

## Testing Guidelines

No automated tests are committed. Do not treat `deno check` as green today: it reports type errors, including stale `Deno.run` usage and manifest type mismatches. Run it when touching types so regressions are visible.

Before behavioral changes, run the smoke tests above with a fresh `HOME`. For install changes, verify one local bucket entry, shim creation, cache behavior, and any Docker path affected.

## Commits & Pull Requests

Recent commit subjects are short and imperative, for example `Improve to add ruby compile for bcat` and `improve remote fetching`.

Pull requests should describe the command path changed, commands run, and manual install scenarios. For manifest updates, include app name, version, architectures, archive type, binary path, and Docker requirements.

## Security Notes

Treat bucket manifests as executable install instructions. Review URLs, archive paths, Docker commands, and delegated shell commands carefully. Do not commit secrets or machine-specific absolute paths.
