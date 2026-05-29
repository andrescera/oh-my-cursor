# Adoption Matrix

> oh-my-cursor feature adoption status for Cursor 3.6.21 (cursor-bin 3.6.21-1, vscodeVersion 1.105.1, commit e7a7e93f4d75f8272503ecf33cedbaae10114a10) native capabilities. Re-audited 2026-05-29; claims carry per-claim `last-verified` markers — unmarked claims retain their 3.0.16 baseline and were not re-verified at 3.6.21.

**Legend:** **Surface** = where the capability lives. **Evidence** follows the [README taxonomy](README.md#evidence-taxonomy). **Status** reflects this **repository’s** use, not whether Cursor ships the feature.

| Feature | Surface | Evidence | Status | Notes |
|---------|---------|----------|--------|-------|
| Custom Agents (`.cursor/agents/`) | IDE | [official-doc] | Using | 11 agent definitions |
| Agent Hooks (19 of 21 events wired) | IDE | [official-doc] | Using | Via daemon + `hooks/hooks.json` wires 19 of the 21 canonical events (`beforeTabFileRead`, `afterTabFileEdit` not wired). Only 7/16 tools fire postToolUse — see [sharp edges](19-known-sharp-edges.md#hook-tool-coverage) <!-- last-verified: 3.6.21 --> |
| Tab Hooks (`beforeTabFileRead`, `afterTabFileEdit`) | IDE | [official-doc] | Not Using | Could Use |
| Hooks auto-reload | IDE | [official-doc] | Using | Edits to hook config reload without restart |
| Multi-root workspace hooks | IDE | [changelog] | Using | Behavior fixed 3.0-era; plugin ships project hooks |
| Enterprise / team / MDM hooks | IDE | [official-doc] | Not Using | Enterprise |
| Third-party hook mapping (e.g. Claude Code) | IDE | [official-doc] | Not Using | Could Use |
| Slash Commands (plugin `commands/`) | IDE | [official-doc] | Using | 16 commands |
| Built-in `/worktree`, `/best-of-n` | IDE | [changelog] | Using (documented) | Thin wrappers at [`commands/worktree.md`](../../commands/worktree.md), [`commands/best-of-n.md`](../../commands/best-of-n.md) <!-- last-verified: 3.6.21 --> |
| Rules (`.mdc` / `.md`) | IDE | [official-doc] | Using | 7 rules <!-- last-verified: 3.6.21 --> |
| Rule types (Always, Glob, Intelligent, Manual) | IDE | [official-doc] | Using | Via frontmatter + settings |
| Team Rules | IDE | [official-doc] | Not Using | Enterprise |
| Remote Rules (GitHub / install) | IDE | [official-doc] | Not Using | Could Use |
| AGENTS.md | IDE | [official-doc] | Not Using | Could Use |
| Skills (`SKILL.md`) | IDE | [official-doc] | Using | 7 plugin skills |
| Cursor-shipped Skills (`~/.cursor/skills-cursor/`) | IDE | [repro-local] | Not Using | Could Use |
| `/migrate-to-skills` | IDE | [official-doc] | Not Using | Could Use |
| MCP (stdio / HTTP / SSE) | IDE | [official-doc] | Using | Sidecar + user servers |
| MCP Apps | IDE | [changelog] | Using | Dashboard resource |
| MCP OAuth | IDE | [official-doc] | Not Using | Could Use |
| `vscode.cursor.mcp.registerServer()` | Extension | [repro-local] | Not Using | Could Use; see also `vscode.lm.registerMcpServerDefinitionProvider` in [Extension API](14-extension-api.md) |
| `vscode.lm.registerMcpServerDefinitionProvider` | Extension | [repro-local] | Not Using | Could Use |
| `permissions.json` | IDE | [official-doc] | Not Using | Not-Adoptable (persistence-only) <!-- last-verified: 3.6.21 --> |
| SwitchMode tool | IDE | [official-doc] | Using | Plan / Agent / Ask |
| AskQuestion tool | IDE | [official-doc] | Using | Prometheus |
| TodoWrite tool | IDE | [official-doc] | Using | Atlas, coordinators. **Caveat:** postToolUse does not fire for TodoWrite (verified). preToolUse status unconfirmed. Hook-dependent todo tracking may be limited. |
| GenerateImage tool | IDE | [official-doc] | Using | multimodal-looker |
| FETCH_RULES tool | IDE | [official-doc] | Using | Metis, Momus, Oracle, Atlas |
| SEARCH_SYMBOLS tool | IDE | [official-doc] | Using | Oracle |
| Task tool (subagents) | IDE | [official-doc] | Using | Coordinator dispatch |
| Nested subagents | IDE | [changelog] | Using | Supported 2.5+ |
| Background Task (`run_in_background`) | IDE | [official-doc] | Using | explore, librarian |
| Plan System (`.cursor/plans/`, plan UI) | IDE | [official-doc] | Using | Prometheus / Atlas. **Caveat:** CreatePlan has non-deterministic file placement and does not fire hooks. Use Write instead — see [sharp edges](19-known-sharp-edges.md#plans) |
| Plan default location (`~/.cursor/plans/`) | IDE | [official-doc] | N/A | Product default for new plans; this repo also stores plans under `.cursor/plans/` when saved to workspace |
| Plugin System (`.cursor-plugin/`) | IDE | [official-doc] | Using | `plugin.json` + `sandbox.json` |
| Agents Window | IDE | [changelog] | Not Using | Could Use |
| Design Mode | IDE | [changelog] | Not Using | Could Use |
| Agent Tabs | IDE | [changelog] | Not Using | N/A (UI) |
| Voice input | IDE | [changelog] | Not Using | N/A (UI) |
| Shared chats + plans (3.0) | IDE | [changelog] | Not Using | N/A |
| Branch selection (agent workflows, 3.1) | IDE | [changelog] | Not Using | N/A |
| Composer checkpoints / revert | IDE | [official-doc] | Not Using | Could Use |
| Queued composer messages | IDE | [official-doc] | Not Using | N/A (UX) |
| Await tool | IDE | [changelog] | Using (documented) | `AwaitShell` for shell commands only; Task completions via end-of-turn notifications — see `orchestrator-reference.mdc`, `commands/start-work.md` <!-- last-verified: 3.6.21 --> |
| Browser automation tools | IDE | [official-doc] | Not Using | Could Use |
| CLI `--mode` | CLI | [official-doc] | Not Using | Could Use |
| CLI `--print` / `--output-format` | CLI | [official-doc] | Not Using | Could Use |
| CLI `agent acp` | CLI | [official-doc] | Not Using | Could Use |
| CLI `--resume` / `--continue` | CLI | [official-doc] | Not Using | Could Use |
| CLI `--cloud` | CLI | [official-doc] | Not Using | Could Use |
| CLI `--worktree` / `--worktree-base` | CLI | [official-doc] | Not Using | Could Use |
| CLI `cli-config.json` / `.cursor/cli.json` | IDE | [official-doc] | Not Using | Could Use |
| ACP session modes (agent / plan / ask) | ACP | [official-doc] | Not Using | Could Use |
| ACP methods (`cursor/ask_question`, `cursor/create_plan`, `cursor/update_todos`, `cursor/task`, `cursor/generate_image`) | ACP | [official-doc] | Not Using | Could Use |
| Cloud Agents API | HTTP | [official-doc] | Experimental | `/cloud-agents` command family |
| Cursor extension API proposals (`control`, `cursor`, …) | Extension | [repro-local] | Not Using | Unverified for third-party |
| `cursor.composer.shouldAllowCustomModes` | Setting | [repro-local] | Not Using | Unverified effect |
| Statsig feature flags | Internal | [binary-only] | N/A | Not user-facing contract |
| `removeLinesBeforeCompiling…` build strips | Internal | [binary-only] | N/A | Compile-time; see [Settings & Flags](15-settings-and-flags.md) |
| Bugbot / Bugbot MCP | IDE | [changelog] | Not Using | Enterprise |
| Cloud agents (no MCP) | IDE | [official-doc] | N/A | Documented limitation |
| skill_mcp (sidecar) | IDE | [repro-local] | Using | Loads SKILL.md into agent context |
| Native orchestration (`orchestration.mode: native`) | IDE | [repro-local] | Using | Root persona by Cursor mode. **Caveat:** Mode detected via heuristics, not hook payloads. activePlan lifecycle has known gaps — see [sharp edges](19-known-sharp-edges.md) |
| `/multitask` command (async parallel subagents) | IDE | [official-doc] | Could Use | Native 3.2 command; repo's parallel patterns use the Task tool rule, not this command directly |
| `workspaceOpen` hook event (21st event) | IDE | [binary-only] | Using (observe-only) | Wired as observe-only in `hooks.json` at 3.6.21; fires on workspace init (not during active sessions). 19 of 21 wired. <!-- last-verified: 3.6.21 --> |
| Pin skills as quick actions | IDE | [official-doc] | Could Use | oh-my-cursor skills (loop, canvas, create-hook, etc.) are strong candidates for pinning |
| `/loop` skill | IDE | [official-doc] | Using | Shipped at `~/.cursor/skills-cursor/loop/SKILL.md`; runs a prompt on a local schedule |
| `@modelcontextprotocol/sdk` bundled in Cursor | Internal | [binary-only] | N/A | Cursor-internal bundle; signals deeper first-party MCP paths; no user adoption action required |
| Build in Parallel from plans | IDE | [official-doc] | Could Use | Plans used via Prometheus/Atlas; parallel step dispatch via "Build in Parallel" not yet explicit in workflow |
| Cursor SDK `@cursor/sdk` | HTTP/CLI | [official-doc] | Could Use | SDK skill shipped (`sdk/SKILL.md`); repo does not yet use `@cursor/sdk` programmatically |
| Explore subagent model controls | Setting | [official-doc] | Could Use | Sub-agent model-selection rules exist; Cursor's Explore subagent setting not explicitly configured in this repo |
| Compact chat response density | Setting | [official-doc] | N/A | User-level UI preference (Compact/Balanced/Detailed); not a repo configuration concern |
| `--add-mcp <json>` CLI flag | CLI | [official-doc] [repro-local] | Using (documented) | Documented in `docs/cursor/15-settings-and-flags.md` <!-- last-verified: 3.6.21 --> |
| `--chat` CLI flag | CLI | [binary-only] | Not Using | Could Use; opens standalone chat window without full IDE; present in `cursor --help` at 3.6.21 |
| `serve-web` CLI subcommand removed | CLI | [repro-local] | N/A | **Breaking:** absent in 3.6.21; any automation using `cursor serve-web` must be updated |
| `cursor-agent-worker` / `cursorPseudoterminal` | Extension | [binary-only] | N/A | Cursor-internal architecture split of `cursor-agent`; no user-facing extension contract exposed |
| Plugins bundle rules/skills/hooks/MCP/subagents (distribution modes) | IDE | [official-doc] | Using | Plugin already ships hooks, skills, rules, and MCP via `plugin.json`; Default Off/On/Required modes now available per bundled item |
| Context Usage Breakdown panel | IDE | [official-doc] | Could Use | Useful for right-sizing oh-my-cursor rules; UI panel, not programmatically controllable |

---

## Columns

| Column | Meaning |
|--------|---------|
| **Feature** | Capability or integration point |
| **Surface** | IDE, CLI, ACP, HTTP, Extension, Setting, or Internal |
| **Evidence** | How the row is justified (see taxonomy) |
| **Status** | **Using** / **Not Using** / **Experimental** / **N/A** |
| **Notes** | Repo-specific or caveats |

---

## See also

- [Cursor 3.x Native Features Reference](README.md) — full index.
- [Old integration summary (redirect)](../cursor-features.md) — historical pointer.
