# MCP (Model Context Protocol)

> Cursor 3.6.21 (cursor-bin 3.6.21-1, vscodeVersion 1.105.1, commit e7a7e93f4d75f8272503ecf33cedbaae10114a10). Evidence tags per claim. Re-audited 2026-05-29; claims carry per-claim `last-verified` markers — unmarked claims retain their 3.0.16 baseline and were not re-verified at 3.6.21.

Evidence tags: `[official-doc]`, `[changelog]`, `[repro-local]`, `[binary-only]`, `[community]`.

## Transports

MCP servers connect over supported transports including **stdio**, **SSE**, and **Streamable HTTP** (terminology and availability per Cursor docs). [official-doc]

## Capabilities

The protocol surface Cursor integrates includes, among others: **Tools**, **Prompts**, **Resources**, **Roots**, **Elicitation**, and **MCP Apps**. [official-doc]

## MCP Apps

MCP Apps are called out in **Cursor 3.0** release notes as part of the MCP story (dashboard / app-oriented workflow). [changelog 3.0]

## OAuth callback URI

For MCP OAuth flows, Cursor documents a redirect URI of the form:

`cursor://anysphere.cursor-mcp/oauth/callback`

[official-doc]

## Configuration locations

MCP server definitions can live in:

- `.cursor/mcp.json` (workspace / project) [official-doc]
- `~/.cursor/mcp.json` (user) [official-doc]
- Plugin-supplied `mcp.json` (bundled with a Cursor plugin) [official-doc]

## Extension API

Extensions can register MCP servers via `vscode.cursor.mcp.registerServer()` (Cursor-proposed API). [repro-local]

## Permissions

Tool and MCP permission persistence is associated with `~/.cursor/permissions.json` in Cursor’s permission model. [official-doc]

## Subagents and MCP

MCP availability for **subagents** follows Cursor’s documented inheritance rules (what the parent session exposes vs. what a nested agent may use). [official-doc]

## Cloud agents

**Cloud agents** do **not** support MCP in Cursor’s documented limitations. [official-doc]

## oh-my-cursor integration

- **Sidecar:** local MCP sidecar exposing **8** tools (project wiring; see plugin MCP config). [repro-local]
- **MCP Apps:** dashboard-oriented usage where applicable. [repro-local]
- **External MCP:** optional third-party servers (e.g. web search, grep) configured per user/project. [repro-local]

---

## Cursor 3.1 → 3.6 changes

> **last-verified: 3.6.21** — Re-audited 2026-05-29. Extraction date: 2026-05-29. Source: Wave 3 T3.1 feature discovery (`docs/internal/reaudit-3621/feature-discovery-3.1-3.6.md` § 6). <!-- last-verified: 3.6.21 -->

### M-01 · `@modelcontextprotocol/sdk` bundled in Cursor

The official MCP SDK (`@modelcontextprotocol/sdk`) is now present in Cursor's bundled `node_modules` at 3.6.21. It was absent in 3.0.16. This signals deeper first-party MCP integration paths and reduces per-plugin SDK version conflicts for extension developers.

- **Version:** unknown (present at 3.6.21; no changelog entry)
- **Evidence:** `[binary-only]` `[repro-local]`

### M-02 · MCP auth token lifecycle improvements

Stale credential cleanup on re-auth, transient 401 handling, and large-token edge-case fixes were delivered across two releases:

- **3.3 (May 7, 2026):** stale token cleanup on re-auth; explicit stale credential handling; transient 401 recovery. `[official-doc]`
- **3.4 (May 13, 2026):** additional large-token handling fixes; auth token lifecycle hardening. `[official-doc]`

Relevant to MCP servers using OAuth flows (e.g. via the `cursor://anysphere.cursor-mcp/oauth/callback` redirect URI).

### M-03 · MCP connection stability under high parallelism

Enhanced MCP connection stability when many subagents are running concurrently (e.g. via `/multitask`). Prevents connection drops under load that were observable in 3.0–3.2 with heavy parallel agent trees.

- **Version:** 3.3 (May 7, 2026)
- **Evidence:** `[official-doc]` `[community]`

Directly relevant to oh-my-cursor sidecar configurations that serve MCP tools to multiple simultaneous subagents.

### M-04 · MCP structured content support

MCP Apps now support **structured content** in tool outputs, enabling richer responses beyond plain text (e.g. typed data, tables, embedded artifacts).

- **Version:** 3.0 (Apr 2, 2026)
- **Evidence:** `[official-doc]`

### M-05 · Bugbot MCP support

Bugbot can access configured MCP servers for additional context during automated code reviews. Configurable per team in the Bugbot dashboard (Teams and Enterprise plans).

- **Version:** Apr 8, 2026 (between 3.0 and 3.1)
- **Evidence:** `[official-doc]`

### M-06 · `--add-mcp <json>` CLI flag

New CLI flag to register an MCP server definition without editing `mcp.json` by hand. Accepts a JSON server definition inline. Companion flag `--mcp-workspace` scopes the registration to the workspace rather than the user profile.

```bash
cursor --add-mcp '{"name":"my-server","command":"npx","args":["-y","my-mcp-server"]}' --mcp-workspace
```

- **Version:** confirmed present at 3.6.21; first-seen version unknown
- **Evidence:** `[repro-local]` (captured in `cli-facts-3621.md`)

Also documented in `docs/cursor/09-cli.md`.
