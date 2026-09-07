# Command Autocomplete

## Aim

Provide shell autocomplete for common Scoopix commands and dynamic package/version arguments.

## Candidate Scope

- Complete top-level commands such as `install`, `versions`, `upgrade`, `uninstall`, `bucket`, `autotest`, `config`, and `doctor`.
- Complete package names from configured buckets, including `bucket/app` forms.
- Complete installed app names for commands that operate on installed packages.
- Complete available versions after `bucket/app@` or for `--version` where practical.
- Complete named autotests from `scoopix autotest list`.

## Design Notes

- Prefer generating completions from the existing Cliffy command model if available.
- Add a command such as `scoopix completions <shell>` or `scoopix completion <shell>` for `bash`, `zsh`, `fish`, and possibly PowerShell later.
- Keep dynamic completion helpers fast and read-only.
- Dynamic version completion should use `versionSource` only when explicitly requested by the shell completion path, because remote version pages can be slow.
- Static completions should work offline.

## Open Questions

- Should remote version completion be enabled by default or only behind a cache?
- Should completion scripts be installed by `scoopix config path`, a separate command, or both?
- Which shell should be implemented first: Bash/Git Bash, zsh, fish, or PowerShell?
