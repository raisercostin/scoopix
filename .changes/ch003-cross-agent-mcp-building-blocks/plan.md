# Universal MCP Search, Scan, Install Plan

## Summary

Build one trusted local control plane that provides three universal MCP capabilities across OpenCode, Codex CLI, and Gemini CLI:

1. Search MCPs
2. Securely scan MCPs before use
3. Install, enable, disable, update, and uninstall MCPs

This should be implemented as one trusted bootstrap system with three capability groups, not as three mutually dependent MCPs. That avoids a bootstrap loop where the installer depends on the scanner, the scanner depends on the searcher, and none can be safely established first.

The same system should later be able to evaluate and manage MCPs such as `opencode-quota`.

---

## Goals

- Create a cross-agent MCP management layer for:
  - discovering MCPs
  - evaluating MCP safety
  - installing only approved MCPs
- Support at least:
  - OpenCode
  - Codex CLI
  - Gemini CLI
- Enforce a policy:
  - search candidate
  - scan candidate
  - install only if approved
  - verify after install
  - disable or uninstall if later found unsafe
- Keep the system local-first and policy-driven

---

## Non-Goals

- Do not attempt to solve every MCP transport and host integration on day one
- Do not rely on a universal upstream MCP packaging/security standard
- Do not automatically trust community MCPs without local validation
- Do not start with broad remote execution or daemon-heavy architecture unless needed

---

## Core Design Decision

### Do not build three separate bootstrap MCPs

Avoid this chain:

1. search MCP for install MCP
2. install install-MCP
3. search MCP for scan MCP
4. install scan-MCP

This creates a trust and bootstrap loop.

### Build one trusted bootstrap backend instead

The first trusted component should provide all three capabilities:

- `registry/search`
- `security/scan`
- `install/manage`

Then any later MCP goes through that gate.

---

## High-Level Architecture

```text
Trusted Bootstrap Backend
- registry/search engine
- security scan engine
- install/manage engine
- local state store
- policy engine

Exposed via:
- one MCP server
- optional local CLI
- optional local HTTP API later

Host Adapters
- OpenCode adapter
- Codex CLI adapter
- Gemini CLI adapter
```

---

## Universal Building Blocks

## 1. Universal MCP Search

Purpose:
- Find MCPs from multiple sources
- Normalize metadata for later scan and install

Sources:
- GitHub repositories
- GitHub MCP registry
- npm
- PyPI
- official docs / known MCP catalogs
- optional curated allowlist

Responsibilities:
- search by name, tag, provider, host compatibility
- resolve package -> repo -> docs -> install method
- normalize metadata

Suggested MCP tools:
- `search_mcps`
- `get_mcp_metadata`
- `resolve_mcp_source`

Example outputs:
- name
- package source
- repo URL
- latest version
- install command
- transport type
- host compatibility
- declared permissions
- maintenance signals

---

## 2. Universal MCP Secure Scan

Purpose:
- Evaluate MCP safety before installation or activation

Two scan layers:

### Static scan
Checks:
- source repository exists
- package/repo/maintainer consistency
- release freshness
- version pinning support
- presence of source vs dist-only package
- suspicious install scripts
- required env vars
- file/network/process access expectations
- transport type
- documented tools/resources/prompts
- stars/activity/issues as weak trust signals only

### Dynamic scan
Run in quarantine or sandbox when feasible:
- start MCP in isolated mode
- enumerate tools/resources/prompts
- capture spawned processes
- observe outbound connections
- inspect filesystem touchpoints
- compare declared vs observed behavior

Suggested MCP tools:
- `scan_mcp`
- `rescan_mcp`
- `verify_mcp_runtime`

Result states:
- `pass`
- `warn`
- `fail`

Important:
- install should be blocked on `fail`
- `warn` may be allowed only by explicit policy

---

## 3. Universal MCP Install and Lifecycle Management

Purpose:
- Install, enable, disable, uninstall, and update MCPs only after policy approval

Responsibilities:
- write host-specific config
- support staged install
- support quarantine mode
- verify post-install behavior
- rollback or disable on mismatch

Suggested MCP tools:
- `install_mcp`
- `enable_mcp`
- `disable_mcp`
- `uninstall_mcp`
- `update_mcp`
- `verify_installed_mcp`

Lifecycle:
1. candidate discovered
2. metadata resolved
3. scan executed
4. if approved, install in disabled/quarantine mode
5. runtime verification
6. enable for specific hosts
7. periodic re-scan on update
8. disable/uninstall if policy violation appears later

---

## Trust Model

## Trusted bootstrap

One manually trusted local package or local source checkout is the root of trust.

Requirements:
- source-visible
- pinned dependency tree where possible
- reproducible install path
- minimal permissions
- local state only by default

This trusted bootstrap is the only thing initially installed without going through itself.

## Everything else is untrusted by default

Every later MCP is:
- searched
- scanned
- installed disabled or quarantined
- verified
- then enabled

---

## Standard Workflow

## Candidate onboarding

1. Search registry for an MCP
2. Resolve package, repo, docs, version, and install method
3. Run static security scan
4. If allowed, run dynamic scan in quarantine
5. Produce risk result
6. If `pass`, install disabled
7. Verify actual runtime tools and behavior
8. Enable only for approved hosts

## Ongoing maintenance

1. Detect version updates
2. Re-run scan
3. Compare new permissions/tools against prior version
4. Auto-disable on policy failure
5. Optional uninstall on severe mismatch

---

## Normalized Metadata Schema

Each MCP candidate should normalize into something like:

```json
{
  "id": "codex-status-mcp",
  "name": "codex-status-mcp",
  "repoUrl": "https://github.com/owner/repo",
  "packageSource": {
    "type": "npm",
    "name": "codex-status-mcp",
    "version": "0.4.3"
  },
  "installCommand": ["npx", "-y", "codex-status-mcp", "--mcp"],
  "transport": "stdio",
  "declaredTools": ["get_codex_status"],
  "requiredEnv": [],
  "permissions": {
    "filesystem": "limited",
    "network": true,
    "processSpawn": true
  },
  "compatibility": {
    "opencode": true,
    "codex": true,
    "gemini": "unknown"
  },
  "scanStatus": "warn",
  "riskScore": 42
}
```

Minimum fields:
- `id`
- `name`
- `repoUrl`
- `packageSource`
- `version`
- `installCommand`
- `transport`
- `declaredTools`
- `requiredEnv`
- `permissions`
- `compatibility`
- `scanStatus`
- `riskScore`

---

## Security Policy

## Hard fail conditions

Block install if:
- no source repository is available
- package and repo identity do not match
- install path requires floating, unpinned execution without policy approval
- only obfuscated/minified output exists and no source is available
- suspicious `postinstall` or shell bootstrap behavior is detected
- runtime behavior differs materially from declared purpose
- MCP requests clearly excessive permissions unrelated to purpose
- MCP attempts access to sensitive environment variables unrelated to function

## Warning conditions

Allow only with explicit policy or user approval:
- low-maintenance/low-signal repo
- sparse documentation
- broad but explainable network access
- HTTP transport with weak auth defaults
- package executes external binaries
- host compatibility is inferred, not documented

## Runtime enforcement

Even after passing scan:
- install disabled first
- verify tool inventory
- verify transport config
- observe startup behavior
- enable only after verification
- periodic re-scan on version changes

---

## Host Adapter Plan

## OpenCode adapter
Responsibilities:
- write/update OpenCode MCP config in the correct config location
- support enable/disable without deleting metadata
- record host-specific install state
- verify host can discover tools

## Codex CLI adapter
Responsibilities:
- manage `codex mcp add/remove` equivalent config state
- support stdio MCP registration first
- verify Codex can list and see tool metadata

## Gemini CLI adapter
Responsibilities:
- support whatever config format Gemini CLI uses for MCP registration
- start with stdio transport if supported
- verify MCP discoverability and tool visibility

Common adapter interface:
- `install(candidate, host)`
- `enable(candidate, host)`
- `disable(candidate, host)`
- `uninstall(candidate, host)`
- `verify(candidate, host)`

---

## Transport Scope

## MVP transport support
Start with:
- `stdio`

Reason:
- simplest security model
- easiest host compatibility
- easiest to quarantine and observe

## Later transport support
Add later:
- local HTTP
- SSE / Streamable HTTP if needed

HTTP-specific requirements:
- loopback bind by default
- auth required for non-loopback
- token validation
- explicit network policy

---

## Data and State Storage

Need a small local database or state store for:
- discovered MCPs
- scan history
- install state by host
- runtime verification results
- policy decisions
- version tracking
- audit trail

Suggested stored concepts:
- candidates
- scans
- installs
- host_bindings
- updates
- policy_events

---

## Initial MCP Tool Surface

Expose one MCP server with tools such as:

- `search_mcps`
- `get_mcp_metadata`
- `scan_mcp`
- `verify_mcp_runtime`
- `install_mcp`
- `enable_mcp`
- `disable_mcp`
- `uninstall_mcp`
- `update_mcp`
- `list_installed_mcps`
- `list_scan_results`
- `get_policy_status`

Optional resources:
- `mcp-manager://installed`
- `mcp-manager://scan-history`
- `mcp-manager://policy`

---

## Example End-to-End Flow for opencode-quota

1. Search for `opencode-quota`
2. Resolve repo, package, and install docs
3. Scan:
   - inspect repo health
   - inspect package behavior
   - inspect plugin/config side effects
   - inspect permissions and runtime model
4. If approved:
   - install in OpenCode only first
   - verify commands/tools are available
   - keep disabled in other hosts unless compatible
5. On update:
   - re-scan
   - compare behavior drift
   - disable if policy fails

---

## MVP Phases

## Phase 1: Bootstrap core
Deliver:
- local CLI
- local state store
- metadata schema
- basic policy engine

## Phase 2: Search engine
Deliver:
- GitHub search integration
- registry lookup
- metadata normalization

## Phase 3: Static scanner
Deliver:
- package/repo consistency checks
- install command analysis
- dependency/install risk heuristics
- permission inference

## Phase 4: Stdio install manager
Deliver:
- host adapters for OpenCode, Codex CLI, Gemini CLI
- install/enable/disable/uninstall flow
- disabled-by-default installs

## Phase 5: Runtime verifier
Deliver:
- startup probe
- tool enumeration
- behavior comparison
- quarantine verification

## Phase 6: MCP server
Deliver:
- expose search/scan/install tools through MCP
- make the manager itself usable from multiple hosts

## Phase 7: Update and policy automation
Deliver:
- version tracking
- re-scan on update
- auto-disable on failures

---

## Verification Strategy

For each host:
- can host discover installed MCP?
- are expected tools visible?
- does runtime match declared metadata?
- can enable/disable happen without manual cleanup?
- can uninstall fully remove host binding?

For each candidate:
- static scan deterministic
- dynamic scan reproducible
- risk output understandable
- install blocked on hard failures

For overall system:
- same candidate can be evaluated once and applied to multiple hosts
- audit trail explains why something was blocked or allowed

---

## Risks and Constraints

- There is no universal MCP packaging/security standard yet
- Many community MCPs are early and inconsistent
- Host config formats may change over time
- Some MCPs will require heuristic analysis rather than guaranteed metadata
- Dynamic scanning may be incomplete without strong sandboxing
- “Universal” will mean policy and workflow consistency, not perfect runtime uniformity

---

## Recommended Implementation Order

1. Trusted bootstrap CLI/backend
2. Search normalization
3. Static scan
4. OpenCode adapter
5. Codex adapter
6. Gemini adapter
7. Dynamic scan/quarantine
8. MCP wrapper around the manager itself
9. Update policy and re-scan automation

---

## Open Questions

1. Should MVP support only `stdio` MCPs, or `http` too?
2. Should `warn` block by default, or allow manual approval?
3. Should installs default to:
   - disabled
   - quarantined
   - enabled after verification
4. Should uninstall happen automatically on policy failure, or only disable?
5. Should there be an allowlist mode for known/trusted MCPs?
6. How strict should compatibility checks be for Gemini CLI at MVP?

---

## Recommended Default Policies

- Start with `stdio` only
- Block on `fail`
- Allow `warn` only with explicit approval
- Install disabled first
- Verify before enable
- Re-scan on every version change
- Auto-disable on runtime mismatch
- Keep uninstall manual except for clearly malicious or broken behavior

---

## Success Criteria

The system is successful when a user can do the following safely and repeatably:

1. Search for an MCP
2. Inspect normalized metadata
3. Run a security scan
4. Install only if approved
5. Enable it for one or more hosts
6. Re-scan on update
7. Automatically disable it if it drifts from policy

At that point, MCPs like `opencode-quota` can be managed through the same trusted workflow.
