# Change ch001: Scoopix Completion Targets

## Summary
Add shell Completion as a first-class Scoopix package capability and make target-oriented installs support repeatable targets.

## Requirements
- Requirements are cumulative. Later constraints refine the active model unless explicitly approved as replacements.
- Preserve the grill interview trail in this change record, not only final decisions.
- Use **Completion** as the canonical term for shell candidate generation.
- Avoid "autocomplete" except as an informal alias.
- Keep **Autosuggest** separate from **Completion**.
- Implement through TDD-style vertical slices: one behavior test, minimal implementation, repeat.
- Tests should verify behavior through public interfaces or existing user-facing command paths where practical.
- Completion must be a first-class package named `scoopix-completion`.
- Completion must install into one or more shell-specific **Targets**.
- Completion command bindings must use repeatable `--for-command`.
- `--target` must be repeatable globally for target-oriented packages, not only for completion.
- Shell adapters should delegate dynamic candidates to Scoopix instead of duplicating package/target knowledge.

## Scope
- Support repeatable `--target` for target-oriented packages.
- Add `scoopix-completion` as a package with shell-specific targets.
- Support repeatable `--for-command` for completion command bindings.
- Add an internal completion protocol used by shell adapters.
- Document resolved terms and decisions as they emerge.

## Interview Log

### 1. Should shell candidate generation be called autocomplete?

Question: What is the canonical domain term for command-line candidate generation?

Options considered:
- Use "autocomplete" because it is familiar.
- Use "completion" because shells and command-line tooling use that term.
- Use "autosuggest" for the feature.

Recommendation: Use **Completion** as the canonical term. Treat "autocomplete" as an informal alias to avoid. Keep **Autosuggest** separate because it predicts whole command lines from history or context, while Completion lists valid candidates.

User answer: Accepted.

Decision: `CONTEXT.md` defines **Completion**, **Completion Adapter**, and **Autosuggest**. The implementation and docs should use Completion.

### 2. Should Scoopix grow a standalone completion command or a completion package?

Question: Should completion be installed through a special top-level command, or modeled as a normal Scoopix package/capability?

Options considered:
- Add a top-level `completion` command.
- Add shell scripts directly to the CLI as a special case.
- Create a first-class `scoopix-completion` package with shell-specific targets.

Recommendation: Create `scoopix-completion` as a first-class package. This keeps Completion aligned with the bucket/package/capability/target model and avoids another special installer path.

User answer: Accepted.

Decision: Add `scoopix-completion` to the bucket manifest with `type: "completion"` and named shell targets.

### 3. Should the shell adapter know package and target data itself?

Question: Should the generated shell script contain all package/target knowledge, or ask Scoopix dynamically?

Options considered:
- Generate a static script with embedded command/package/target lists.
- Generate a shell-specific adapter that calls Scoopix for candidates.

Recommendation: The **Completion Adapter** should call Scoopix through an internal protocol such as `__complete`, so Completion stays aligned with buckets, installed targets, and future package sources.

User answer: Accepted.

Decision: Implement a shell-agnostic internal protocol and shell-specific renderers/adapters.

### 4. How should dev command names work?

Question: How should Completion work for both installed `scoopix` and development aliases such as `scoopix-dev`?

Options considered:
- Generate separate hard-coded scripts for each command name.
- Assume the command is always `scoopix`.
- Make the adapter command-name agnostic and delegate through the command being completed.

Recommendation: The adapter should call `${COMP_WORDS[0]} __complete ...` in Bash, or the equivalent in other shells. That makes the same script work for `scoopix`, `scoopix-dev`, and custom aliases.

User answer: Accepted.

Decision: Bash renderer must contain `${COMP_WORDS[0]}` delegation.

### 5. How should users bind command names?

Question: Which option name should specify command bindings for Completion?

Options considered:
- `--command`
- `--bind`
- `--for-command`

Recommendation: Initially suggested `--command`, then user preferred `--for-command` as more self-described.

User answer: Use `--for-command`.

Decision: Completion install supports repeatable `--for-command`, defaulting to `scoopix` when omitted.

Canonical examples:

```sh
scoopix install scoopix-completion --target bash --for-command scoopix
scoopix-dev install scoopix-completion --target bash --for-command scoopix-dev
scoopix-dev install scoopix-completion --target bash --target clink --for-command scoopix --for-command scoopix-dev
```

### 6. Should multiple targets be completion-only or global?

Question: Should repeatable `--target` apply only to `scoopix-completion`, or globally for all target-oriented packages?

Options considered:
- Repeatable only for `scoopix-completion` now.
- Repeatable globally for target-oriented packages.

Recommendation: Repeatable globally. MCP packages can also reasonably install into multiple targets, such as OpenCode plus project `.mcp.json`.

User answer: "repetable globally yes."

Decision: `--target` is repeatable globally for target-oriented packages. Non-target-oriented packages can reject target usage clearly.

### 7. Where should the grill discussion be recorded?

Question: Should the grill interview be summarized in docs, ADR, changeset, or a `.changes` record?

Options considered:
- ADR under `docs/adr/`.
- `.changeset` package-release style file.
- `.changes/ch001-scoopix-completion-targets/change.md` following `.gene/practice-change-management.md`.

Recommendation: Use `.changes` because the project practice says changes are broader than issues and preserve local history alongside code. ADRs are only for hard-to-reverse, surprising, trade-off decisions. `.changeset` does not fit because this repo has no package-release changeset infrastructure.

User answer: Use `.changes` as explained in `.gene/practice-change-management.md`.

Decision: This file is the living change record. It must include the interview trail, not only final decisions.

### 8. How should TDD compose with grill and change-management?

Question: When the user says "start TDD style", does that switch focus away from grill/change-management requirements?

Incorrect action taken: The agent loaded TDD and immediately started a RED test after creating only a thin 20-line change record.

User correction: Later constraints are clarifying constraints, not focus/mode switches. Requirements should be consistent and should change consistently.

Decision: Skills compose cumulatively. TDD adds vertical RED/GREEN discipline, but it does not erase the requirement to preserve the grill interview in `.changes` first.

Practice updates made:
- `.gene/practice-requirements-consistency.md` added.
- `.gene/README.md` updated with Requirements Consistency Mandate.
- `.gene/practice-change-management.md` updated with preserve-interviews and consistency requirements.
- TDD skill updated with a Constraint Consistency Gate.
- Grill-with-docs skill updated to preserve interview outcomes as active requirements.

### 9. What is the first TDD slice?

Question: Which one behavior should be tested first?

Options considered:
- Start with full Bash Completion rendering.
- Start with hidden `__complete` protocol.
- Start with repeatable target install because it is a prerequisite for both MCP multi-target and completion multi-target.

Recommendation: Start with repeatable global `--target` on existing MCP target behavior. This is the smallest behavior slice and reuses the existing autotest harness.

User answer: Proceed TDD style after the change record is sufficiently detailed.

Decision: First RED test changes MCP install in `runAutotest()` to call `installApp("alpha/chromedev-mcp", { target: ["opencode", "project-mcp"] })` and assert both target files are written.

Observed RED failure:

```text
Error: target 'opencode,project-mcp' not found. Available: opencode, project-mcp
```

Meaning: Current code treats the repeated/array target as one scalar target name. Minimal GREEN should normalize target input to an array and apply target operations one by one.

## Current TDD State
- First RED existed for repeatable target install in `samples/2025-11-10--scoopix/scoopix.ts` autotest.
- First GREEN added target normalization and loops MCP install/uninstall/reinstall over selected targets while preserving single-target behavior.
- Verification passed: `deno run --allow-net --allow-read --allow-write --allow-env --allow-run scoopix.ts autotest` from `samples/2025-11-10--scoopix`.
- Second RED proved the public CLI rejected repeated `--target` flags with `Option "--target" can only occur once`.
- Second GREEN made `--target` collect repeated values on install/uninstall/reinstall.
- Verification passed: `deno run --allow-net --allow-read --allow-write --allow-env --allow-run scoopix.ts autotest` from `samples/2025-11-10--scoopix`.
- Next RED should introduce the smallest internal Completion protocol behavior: `__complete targets <package> <prefix>` returns target names.
- Third RED proved `__complete` did not exist and was parsed as too many root arguments.
- Third GREEN added minimal `__complete targets <package> <prefix>` support.
- Verification passed: `deno run --allow-net --allow-read --allow-write --allow-env --allow-run scoopix.ts autotest` from `samples/2025-11-10--scoopix`.
- Next RED should add package candidate completion: `__complete packages <prefix>` returns bucket-qualified package names.
- Fourth RED proved `__complete packages` was unsupported.
- Fourth GREEN added minimal package candidate completion for app-name or bucket-qualified prefix matches.
- Verification passed: `deno run --allow-net --allow-read --allow-write --allow-env --allow-run scoopix.ts autotest` from `samples/2025-11-10--scoopix`.
- Next RED should install `scoopix-completion` as a package and write a Bash Completion Adapter for repeated `--for-command` bindings.
- Fifth RED first failed because `--for-command` was unknown, then because `completion` was not treated as a non-binary package type by `resolveAppInfo()`.
- Fifth GREEN added repeatable `--for-command`, routed `type: "completion"` packages to the Completion installer, rendered the Bash adapter, and allowed `completion` packages without `url`.
- Verification passed: `deno run --allow-net --allow-read --allow-write --allow-env --allow-run scoopix.ts autotest` from `samples/2025-11-10--scoopix`.

### Resolution
Open.

## Comments
- **2026-07-05 (OpenCode)**: Grill interview resolved **Completion** as the canonical term; avoid "autocomplete" except as an informal alias, and keep **Autosuggest** distinct.
- **2026-07-05 (OpenCode)**: Grill interview resolved completion as a first-class package (`scoopix-completion`), not a new top-level user command.
- **2026-07-05 (OpenCode)**: Grill interview resolved repeatable global `--target` and repeatable `--for-command` for completion command bindings.
- **2026-07-05 (OpenCode)**: Process correction: user clarified that later instructions add constraints rather than switching modes. Updated `.gene` and loaded skills so requirements are treated cumulatively; contradictions must be challenged and explicitly approved before direction changes.
- **2026-07-05 (OpenCode)**: TDD slice 1 passed. Internal repeatable target install now writes both `opencode` and `project-mcp` target configs in autotest.
- **2026-07-05 (OpenCode)**: TDD slice 2 passed. Public CLI now accepts repeated `--target` flags on install/uninstall/reinstall.
- **2026-07-05 (OpenCode)**: TDD slice 3 passed. Internal Completion protocol can list targets for a package.
- **2026-07-05 (OpenCode)**: TDD slice 4 passed. Internal Completion protocol can list package candidates.
- **2026-07-05 (OpenCode)**: TDD slice 5 passed. `scoopix-completion` can install a Bash Completion Adapter bound to multiple command names.
