# Change ch006: Command Taxonomy

## Summary

Separate Scoopix commands into three responsibilities: using installed apps, using configured buckets, and maintaining bucket metadata.

## Decisions

- Use `fetch` for refreshing configured bucket metadata without changing installed apps.
- Keep `update [target]` only as a compatibility alias for `fetch [target]`.
- Use `bucket apply <app> <version>` as the preferred command for applying a discovered version to a local bucket manifest.
- Keep normal user bucket management under `bucket add`, `bucket remove`, and `bucket list`.
- Make `list` default to installed apps, matching common package-manager expectations such as Scoop, Homebrew, Winget, npm, and pip.
- Use `list --all`, `search [query]`, and `available [query]` for configured bucket catalog apps. The query is optional; omitted query lists all available catalog apps.
- Use top-level app commands for installed app state: `reinstall`, `switch`, `downgrade`, `cleanup`, `pin`, and `unpin`.
- Use bucket-maintainer commands for metadata lifecycle work: `bucket discover`, `bucket import`, `bucket ignore`, `bucket test`, `bucket commit`, `bucket push`, `bucket reset`, and `bucket lint`.

## Implementation

- Added top-level `fetch [target]`, backed by the existing git-backed bucket refresh logic.
- Added `bucket fetch [name]` for explicit bucket metadata refresh.
- Added `bucket apply <app> <version>` for local bucket manifest version updates.
- Added `bucket remove <name>` as a readable alias for existing `bucket rm <name>`.
- Updated `update [target]` to warn and delegate to `fetch [target]` semantics.
- Changed `list` and `ls` to show installed apps by default, with `--all` for catalog apps and `--installed` kept for compatibility.
- Added `search [query]` and `available [query]` as catalog views over configured bucket apps.
- Added `reinstall`, `downgrade`, `switch`, `cleanup`, `pin`, and `unpin` app commands.
- Added `bucket discover`, `bucket import`, `bucket ignore`, `bucket test`, `bucket commit`, `bucket push`, `bucket reset`, and `bucket lint` lifecycle commands.

## Rationale

Package ecosystems overload `update`; Scoopix should avoid that ambiguity. The adopted split follows Git and modern package-manager vocabulary: `fetch` changes local metadata/cache, while `upgrade` changes installed packages.

## Future Work

- Refine bucket `import` storage if Scoopix grows a dedicated version-index store separate from saved/pinned versions.
