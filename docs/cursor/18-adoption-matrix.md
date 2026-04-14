# Adoption Matrix

> oh-my-cursor feature adoption status for Cursor **3.0.16** native capabilities.

**Legend:** **Surface** = where the capability lives. **Evidence** follows the [README taxonomy](README.md#evidence-taxonomy). **Status** reflects this **repository’s** use, not whether Cursor ships the feature.

| Feature | Surface | Evidence | Status | Notes |
|---------|---------|----------|--------|-------|
| Custom Agents (`.cursor/agents/`) | IDE | [official-doc] | Using | 11 agent definitions |
| Agent Hooks (18 events) | IDE | [official-doc] | Using | Via daemon + `hooks/hooks.json` |
| Tab Hooks (`beforeTabFileRead`, `afterTabFileEdit`) | IDE | [official-doc] | Not Using | Could Use |
| Hooks auto-reload | IDE | [official-doc] | Using | Edits to hook config reload without restart |
| Multi-root workspace hooks | IDE | [changelog] | Using | Behavior fixed 3.0-era; plugin ships project hooks |
| Enterprise / team / MDM hooks | IDE | [official-doc] | Not Using | Enterprise |
| Third-party hook mapping (e.g. Claude Code) | IDE | [official-doc] | Not Using | Could Use |
| Slash Commands (plugin `commands/`) | IDE | [official-doc] | Using | 16 commands |
| Built-in `/worktree`, `/best-of-n` | IDE | [changelog] | Not Using | Could Use |
| Rules (`.mdc` / `.md`) | IDE | [official-doc] | Using | 6 rules |
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
| `permissions.json` | IDE | [official-doc] | Not Using | Could Use |
| SwitchMode tool | IDE | [official-doc] | Using | Plan / Agent / Ask |
| AskQuestion tool | IDE | [official-doc] | Using | Prometheus |
| TodoWrite tool | IDE | [official-doc] | Using | Atlas, coordinators |
| GenerateImage tool | IDE | [official-doc] | Using | multimodal-looker |
| FETCH_RULES tool | IDE | [official-doc] | Using | Metis, Momus, Oracle, Atlas |
| SEARCH_SYMBOLS tool | IDE | [official-doc] | Using | Oracle |
| Task tool (subagents) | IDE | [official-doc] | Using | Coordinator dispatch |
| Nested subagents | IDE | [changelog] | Using | Supported 2.5+ |
| Background Task (`run_in_background`) | IDE | [official-doc] | Using | explore, librarian |
| Plan System (`.cursor/plans/`, plan UI) | IDE | [official-doc] | Using | Prometheus / Atlas |
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
| Await tool | IDE | [changelog] | Not Using | Could Use |
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
| Native orchestration (`orchestration.mode: native`) | IDE | [repro-local] | Using | Root persona by Cursor mode |

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
