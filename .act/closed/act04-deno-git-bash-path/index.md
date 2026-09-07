# Change ch002: Deno Git Bash PATH

## Summary
Make Deno global installs available from Git Bash on Windows.

## Requirements
- Requirements are cumulative; this change is separate from `ch001-scoopix-completion-targets`.
- Do not reinstall Deno when Deno itself already works.
- Fix the Git Bash environment so Deno-installed commands such as `scoopix-dev` are discoverable.
- Expose the fix as an installable Scoopix package, discoverable by `search deno`.
- The package should be named `deno-config-for-bash` and have a `bash` target.
- Keep the edit minimal and reversible.

## Diagnosis
User installed the Scoopix development command with Deno:

```sh
deno install --allow-all --global samples/2025-11-10--scoopix/scoopix.ts --name scoopix-dev
```

Deno reported successful installation:

```text
C:\Users\raiser\.deno\bin\scoopix-dev.cmd
C:\Users\raiser\.deno\bin\scoopix-dev (shell)
```

But Git Bash could not run it:

```text
bash: scoopix-dev: command not found
```

Observed state:
- `deno --version` works, so Deno is installed.
- `C:\Users\raiser\.deno\bin\scoopix-dev.cmd` exists.
- `C:\Users\raiser\.deno\bin\scoopix-dev` exists.
- Current PATH did not include `C:\Users\raiser\.deno\bin`.
- `~/.bash_profile` sources `~/.bashrc`.
- Deno printed a Windows `cmd.exe` PATH hint (`set PATH=%PATH%;C:\Users\raiser\.deno\bin`), which is not directly usable in Git Bash.

## Decision
Configure Git Bash PATH by adding Deno's global install bin directory to the Bash startup file:

```sh
export PATH="$HOME/.deno/bin:$PATH"
```

This is an environment configuration fix, not a Deno installation. In Scoopix it should be delivered by an installable target-oriented package:

```sh
scoopix search deno
scoopix install deno-config-for-bash --target bash
```

### Resolution
In progress.

Interim machine fix added Deno's global install bin directory to `~/.bashrc`.

Verified in a fresh Git Bash login shell:

```sh
command -v scoopix-dev
scoopix-dev --version
```

Result:

```text
/c/Users/raiser/.deno/bin/scoopix-dev
scoopix 0.1.0
```

## Comments
- **2026-07-05 (OpenCode)**: Created after user observed `scoopix-dev` installed by Deno but unavailable in Git Bash.
- **2026-07-05 (OpenCode)**: Verification also surfaced an existing `.bash_profile` warning for a Windows-style broot source path; left unchanged because this change is scoped to Deno global bin availability.
- **2026-07-05 (OpenCode)**: User clarified the failure mode: Deno reports Windows paths and `cmd.exe` PATH instructions while the user is operating in Git Bash. The fix must translate that into Bash startup syntax.
- **2026-07-05 (OpenCode)**: User corrected implementation direction: this should not only be a direct manual `~/.bashrc` edit; Scoopix should expose a default-bucket package such as `deno-config-for-bash` with target `bash`.
