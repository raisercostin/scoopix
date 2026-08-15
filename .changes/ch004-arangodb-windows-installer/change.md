# Change ch004: ArangoDB Windows Installer

## Summary

Add a Windows ArangoDB installer recipe to the bundled Scoopix bucket and extend binary archive installs so packages can
preserve an extracted application tree while exposing multiple command shims.

## Requirements

- Use `scoop info arangodb` and the installed Scoop bucket as reference material.
- Support Windows ArangoDB through Scoopix where possible.
- Account for the fact that ArangoDB 3.12+ no longer appears to publish native Windows executable artifacts.
- Keep the change aligned with Scoopix as a generalized installer that can download, build, delegate, or install
  artifact-shaped packages.

## Implementation

- Added `main/arangodb` at version `3.11.14`, the latest Windows native package found under
  `https://download.arangodb.com/arangodb311/Community/Windows/`.
- Added all known ArangoDB Windows command shims from the Scoop manifest.
- Added `extractRoot` manifest support so Scoopix can copy a full extracted package layout before linking selected
  executables.
- Extended multi-`bin` handling so archive packages can expose several shims from one install.

## Findings

- `scoop info arangodb` reports the installed Scoop package from `raiser-bucket` with ArangoDB `3.11.3` installed and
  the expected command list.
- `scoop cat arangodb` points at the `arangodb311/Community/Windows` zip package line.
- `https://download.arangodb.com/arangodb311/Community/Windows/index.html` is available and lists
  `ArangoDB3-3.11.14_win64.zip`.
- `https://download.arangodb.com/arangodb312/Community/Windows/index.html` returns 404, so this change does not claim a
  native Windows 3.12+ executable.

## Future Work

- Investigate an ArangoDB 3.12+ Windows experience via WSL or Docker, likely as a delegated/containerized recipe rather
  than a native `.exe` package.
- If Scoopix grows launcher metadata, use it for packages that need a controlled working directory or extra runtime
  environment.

## Resolution

Verified locally on Windows with an isolated `HOME`:

- `scoopix bucket add ./scoopix-main.json main` succeeded.
- `scoopix list` showed `main/arangodb`.
- `scoopix install main/arangodb` downloaded and installed ArangoDB `3.11.14`, preserving the extracted package tree and creating all configured shims.
- `arangosh --version` through the Scoopix shim reported `3.11.14`.
