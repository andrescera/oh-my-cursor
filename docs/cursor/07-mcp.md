# MCP (Model Context Protocol)

> Cursor 3.0.16. Evidence tags per claim.

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
