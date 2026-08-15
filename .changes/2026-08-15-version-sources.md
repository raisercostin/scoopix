# Version Sources

## Aim

Support packages whose upstream versions live in multiple version spaces, such as ArangoDB minor-line repositories.

## Decisions

- CLI version selection uses `bucket/app@version` as the canonical input form.
- `bucket/app:version` remains display/internal wording only.
- `versionSource` may be either one source object or an array of source objects.
- Multiple sources are merged, deduplicated, and sorted with the existing version comparator.
- ArangoDB 3.12 Windows packages were not added because `https://download.arangodb.com/arangodb312/Community/Windows/` returns 404.
- ArangoDB 3.12 Linux versions exist at `https://download.arangodb.com/arangodb312/Community/Linux/index.html`.
- The Linux generic 3.12 tarballs are modeled as a separate `arangodb312-linux-generic` package so they do not corrupt the native Windows `arangodb` URL template.
- `arangodb312-linux-generic` is Linux/WSL-only because the tarball contains ELF binaries, not native Windows executables.
- Building ArangoDB 3.12 from source is documented upstream as a Linux/Docker CMake build flow, not as a native Windows builder flow.
- A native Windows source builder should not be treated as a small Scoopix `src` package until a supported Visual Studio/MSVC or MinGW build recipe is identified.

## Implemented

- `install` supports explicit versions through `@version` and `--version`.
- `versionSource` supports multiple version spaces.
- Added `arangodb312-linux-generic` using the Linux generic tarball version space.
- Removed the misleading Windows arch entry from `arangodb312-linux-generic`; Windows hosts should report the package as unavailable instead of downloading ELF files.
- Investigated `https://github.com/arangodb/arangodb` source build documentation for a possible Windows builder.
- Built-in autotests can be listed and run by name.
- Added targeted tests for locks, force install, explicit version install, and multi-source version discovery.

## Verification

- `scoopix autotest list`
- `scoopix autotest install-version`
- `scoopix autotest locks`
- `scoopix autotest install-force`
- `scoopix autotest`
- `scoopix versions dev/arangodb`
