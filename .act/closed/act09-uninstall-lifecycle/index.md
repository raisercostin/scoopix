# Change ch007: Uninstall Lifecycle

## Summary

Align Scoopix uninstall behavior with Scoop-style installed-version lifecycle semantics.

## Problem

`scoopix list` and `scoopix list --installed` show only the current installed version, but `scoopix uninstall <app>` previously refused when old version directories also existed. This was confusing for direct local source installs such as `rteel` and `act-dev`, where each source hash creates a new version directory.

## User Evidence

- `scoopix list` showed `local/rteel` installed at current version `0.1.7-20260824.196.main.g2d47908.h037203ec61f6`.
- `scoopix uninstall rteel` failed because older version directories also existed: `0.1.7-direct.g037203ec61f6` and `0.1.5-direct.g53a93368b8f4`.
- `scoopix uninstall dev/rteel` produced the same multiple-version error even though the installed owner was `local/rteel`, creating ambiguity about qualified owner scope.
- Scoop comparison: `scoop uninstall wiztree` removed current shims/current link and also removed older version `4.27` without requiring a version.

## Decisions

- `scoopix uninstall <app>` removes the entire resolved installed package identity: all installed version directories, current link, shims, and Scoopix installer metadata.
- `scoopix uninstall <bucket>/<app>` applies only to that exact owner. If the installed owner differs, it fails with a clear owner-mismatch message.
- `scoopix uninstall <app>@<version>` removes only a non-current installed version.
- `scoopix uninstall <app>@<current-version>` refuses by default; users should uninstall the whole app or switch to another version first.
- `--all` remains accepted as an explicit whole-app removal flag, but unqualified uninstall no longer requires it.
- `scoopix cleanup <app>` removes old version directories while keeping the current version, shims, and metadata.
- Future `persist/<app>` data should survive uninstall/reinstall and only be removed by a future purge command.

## Implementation

- Updated uninstall owner resolution so qualified wrong-owner requests fail clearly.
- Changed unqualified uninstall to remove all installed versions for the resolved package identity.
- Added `cleanup <app>`.

## Tests Needed

- Install a direct local source twice with different hashes.
- Verify `list` shows only the current version.
- Verify unqualified `uninstall <app>` removes both versions and shims.
- Verify qualified wrong-owner uninstall fails with an owner mismatch.
- Verify `uninstall <app>@<old-version>` removes only the old version.
- Verify `uninstall <app>@<current-version>` refuses with a clear message.
- Verify `cleanup <app>` keeps current and removes old versions.
