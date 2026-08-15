# Change ch003: Cross-Agent MCP Building Blocks

## Summary
Capture the next Scoopix change around universal MCP building blocks for searching, scanning, and installing MCPs across agents, plus a later quota/tokens usage package.

## Requirements
- Store this as a todo only.
- Do not plan or implement in this session.
- Keep it as a future Scoopix change.
- Treat the building blocks as cross-agent, not specific to one host such as OpenCode only.

## Todo
- Add a universal MCP search package/capability for discovering MCPs across agents.
- Add a universal MCP install package/capability for installing MCPs across agents.
- Add a universal MCP secure-scan package/capability for scanning MCPs before use or install.
- Make secure scan a gate before install; if a scan fails, do not keep the MCP installed.
- Add quota/tokens usage support later for OpenCode CLI and other agents such as Codex CLI and Gemini CLI.
- Ensure the future design can also help install MCPs themselves, not only normal apps.

## Desired Activity Flow
1. Search MCPs for installing MCPs.
2. Install a universal MCP installer.
3. Search MCPs for searching MCPs.
4. Install a universal MCP search tool.
5. Run a secure scan through the universal MCP search/security path.
6. Use the universal installer to install the universal secure-scan MCP.
7. Run the secure-scan MCP against the universal install/search/scan building blocks, and keep them only if the scan passes.
8. After those building blocks exist, install higher-level MCPs such as an `opencode-quota` style package.

## Named Building Blocks To Preserve
- `mcp-universall-install-foo`
- `mcp-universall-search-foo`
- `mcp-universall-secure-scan-foo`

These names are placeholders from the discussion and should be preserved for later refinement rather than normalized prematurely in this todo-only record.

## Notes
- This was mentioned as something added in another session and is being copied here so the next Scoopix changes have a local durable record.
- The intended outcome is three essential universal building blocks: searching, scanning, and installing MCPs, with secure scan as the gatekeeper.

### Resolution
Open.

## Comments
- **2026-07-05 (OpenCode)**: Stored user-requested future todo for cross-agent MCP search/install/secure-scan building blocks and later quota/tokens usage support. No design or implementation done in this session.
