# Feature Discovery — Cursor 3.1 → 3.6.21

> **Scope:** New and changed features from Cursor 3.1 (Apr 13, 2026) through 3.6.21 (binary date 2026-05-28).
> **Baseline:** docs pinned to 3.0.16; hooks baseline 3.1.15.  
> **Input for:** T3.2 (fold into reference pages + adoption matrix). **Do NOT edit `docs/cursor/*.md` from here.**  
> **Cross-referenced against:** `binary-facts-3621.md`, `extension-facts-3621.md`, `cli-facts-3621.md`.
>
> **Evidence tags:** `[official-doc]` = cursor.com/changelog; `[changelog]` = cursor.com/changelog or verified sub-page; `[repro-local]` = verified on live 3.6.21 install; `[binary-only]` = seen only in live binary/extension manifests; `[community]` = third-party source, unconfirmed by official changelog.
>
> **Extraction date:** 2026-05-29. Author: Wave 3 T3.1.

---

## Reconciliation Status for Mandatory Cross-Checks

| Item to cross-check | Binary evidence | Official source | Status |
|---|---|---|---|
| `workspaceOpen` hook event | Present in 3.6.21 enum `Iv`, 2 occurrences | **No changelog entry found** | `[binary-only]` |
| Composer model family | Present: `composer-1/2/2.5/2.5-fast` etc. | Composer 2 announced in v2.0 (Oct 2025); Composer 2.5 May 18, 2026 | `[official-doc]` (2.5); older slugs `[binary-only]` |
| Grok models (`grok-3`, `grok-4`, etc.) | Present in bundle | **No changelog entry found** | `[binary-only]` |
| `gpt-5.5` model | Present in bundle | **No changelog entry found** | `[binary-only]` |
| `@modelcontextprotocol/sdk` bundled | Present in node_modules (3.6.21) | **No changelog entry found** | `[binary-only]` |
| `cursorPseudoterminal` extension proposal | Present in `cursor-agent-exec` manifest | **No changelog entry found** | `[binary-only]` |
| `disable_local_mode` removeLines entry | Present in removeLines array (entry 42) | **No changelog entry found** | `[binary-only]` |
| `composer_session_goal_hook_prompt_config` | Present as Statsig config key | **No changelog entry found** | `[binary-only]` |
| `cursor-agent` → `cursor-agent-worker` refactor | Extension inventory confirmed | **No changelog entry found** | `[binary-only]` |
| v2 agent tools (`read_file_v2`, etc.) | Present (params+result) | **No changelog entry found** | `[binary-only]` |
| `--chat` CLI flag | Present in `cursor --help` | **No changelog entry found** | `[binary-only]` (see CLI section) |
| `serve-web` CLI subcommand removed | Absent in 3.6.21 | **No changelog entry found** | `[binary-only]` (confirmed removed) |

---

## Section 1 — Hooks

Adoption-relevance: `docs/cursor/03-hooks.md`, `docs/cursor/18-adoption-matrix.md`

### H-01 · `workspaceOpen` — New Hook Step Event

- **Description:** 21st hook step event added to the canonical `Iv` enum. Fires when a workspace is opened. The event name appears exactly twice in the bundle (enum + ordered array); it has no human-readable Claude-Code label wired yet ("defined-but-lightly-wired").
- **Version:** unknown (present at 3.6.21; not in any changelog entry as of 2026-05-29)
- **Evidence:** `[binary-only]` `[repro-local]`
- **Details:** All 20 previous events remain unchanged. Canonical set is now 21. Binary-facts GATE A confirms this authoritatively.
- **Adoption relevance (oh-my-cursor):** `docs/cursor/03-hooks.md` canonical list must be updated to 21; test constant `CANONICAL_CURSOR_HOOKS` must include `workspaceOpen`. Affects skill `create-hook`, any automation that iterates hook events.

### H-02 · Hook Invocation / Path-Length Bug Fix

- **Description:** Fixed hook invocation failures caused by path-length issues and Git prompt-related regressions that could silently prevent hooks from running.
- **Version:** 3.4 (May 13, 2026)
- **Evidence:** `[official-doc]` — changelog bug-fix entry "Fixed hook invocation/path-length issues and Git prompt-related regressions."
- **Adoption relevance:** Important for users running hooks on deep directory structures or repos with unusual git configurations. `docs/cursor/03-hooks.md` edge-cases / known sharp edges section.

### H-03 · Multi-Root Workspace Hook Loading Fix

- **Description:** Fixed hooks loading so multi-root workspaces read project hook files from all workspace folders, not only the first one.
- **Version:** 3.0 (Apr 2, 2026) — at baseline of this doc's scope (included for completeness since docs baseline was 3.0.16)
- **Evidence:** `[official-doc]`
- **Adoption relevance:** `docs/cursor/03-hooks.md` workspace-level hooks section. Relevant to oh-my-cursor users with monorepos.

### H-04 · `composer_session_goal_hook_prompt_config` — New Statsig Feature Flag

- **Description:** A new Statsig dynamic config key for controlling hook-prompt behavior during Composer sessions (likely: whether/how a session-goal prompt is injected before hook dispatch).
- **Version:** unknown (present at 3.6.21)
- **Evidence:** `[binary-only]`
- **Adoption relevance:** May affect hook firing order or context. Watch for activation via Statsig rollout.

---

## Section 2 — Agents / Subagents

Adoption-relevance: `docs/cursor/02-agent-system.md`, `docs/cursor/13-agents-window.md`, `docs/cursor/18-adoption-matrix.md`

### A-01 · `/multitask` Command — Async Subagent Parallelism

- **Description:** `/multitask` spawns async subagents in parallel rather than queuing requests sequentially. Cursor automatically decomposes larger tasks into smaller chunks and assigns each to its own subagent. Queued messages can also be redirected to multitask execution mid-run.
- **Version:** 3.2 (Apr 24, 2026)
- **Evidence:** `[official-doc]`
- **Adoption relevance:** Core change to `docs/cursor/02-agent-system.md` (subagent spawning); `docs/cursor/06-commands.md` (`/multitask` entry). Opens new skill patterns for parallel workstreams.

### A-02 · Explore Subagent Model Controls

- **Description:** New settings to control Explore subagent behavior: choose a specific model, inherit parent agent's model, or disable Explore subagents entirely. Also added support for general model names (e.g., `model: opus` always resolves to newest Opus).
- **Version:** 3.3 (May 7, 2026)
- **Evidence:** `[official-doc]`
- **Adoption relevance:** `docs/cursor/02-agent-system.md` subagent configuration section; affects oh-my-cursor subagent model-routing documentation.

### A-03 · `/multitask` Expose Subagent Controls

- **Description:** `/multitask` now exposes Explore-subagent controls: max depth, concurrency ceiling, cost ceiling. Available in both Agents Window and editor.
- **Version:** 3.3 (May 7, 2026)
- **Evidence:** `[official-doc]`, `[community]` (developertoolkit.ai)
- **Adoption relevance:** `docs/cursor/06-commands.md`; skill authoring docs for constrained subagent trees.

### A-04 · `cursor-agent` Extension Replaced by `cursor-agent-worker` + `cursor-agent-exec`

- **Description:** The monolithic `cursor-agent` extension (proposals: `control/cursor/cursorTracing`, activation `*`) is removed. Its role is split into:
  - `cursor-agent-exec` — execution host (now adds `cursorPseudoterminal` proposal)
  - `cursor-agent-worker` (NEW) — install/run worker process (proposals: `cursor/cursorNoDeps`)
- **Version:** unknown (present at 3.6.21)
- **Evidence:** `[binary-only]` `[repro-local]`
- **Adoption relevance:** `docs/cursor/14-extension-api.md` extension inventory must be updated. The split indicates architectural separation of agent execution from agent process management.

### A-05 · `cursorPseudoterminal` Extension Proposal — New

- **Description:** New `enabledApiProposals` entry in `cursor-agent-exec`. Not present in 3.0.16. Likely enables terminal emulation within agent execution flows, providing agents finer-grained pseudo-terminal control (PTY allocation, resize events, etc.).
- **Version:** unknown (present at 3.6.21)
- **Evidence:** `[binary-only]` `[repro-local]`
- **Adoption relevance:** `docs/cursor/14-extension-api.md`; may affect shell hook behavior (`beforeShellExecution`, `afterShellExecution`).

### A-06 · v2 Agent Tools — Versioned Successors

- **Description:** Four v2 variants now present in bundle alongside original v1: `read_file_v2`, `list_dir_v2`, `task_v2`, `run_terminal_command_v2`. The "genuine" (has both `_params` + `_result`) tool count is 67 (reconciled figure; old doc claimed 78, which is non-reproducible).
- **Version:** unknown (present at 3.6.21)
- **Evidence:** `[binary-only]`
- **Adoption relevance:** `docs/cursor/16-binary-analysis.md` tool count reconciliation. Hooks that inspect tool names may need updating.

### A-07 · `codebase_search` Tool Removed; `semantic_search` Added

- **Description:** `codebase_search` tool (0 occurrences in 3.6.21 bundle) is superseded by `semantic_search` / `semantic_search_full`. `browser_screenshot` also removed; browser tool surface tightened (noted in 3.0 changelog).
- **Version:** unknown exact version; likely 3.0–3.2 (browser tool surface reduced in 3.0 changelog; semantic_search seen in 3.6.21)
- **Evidence:** `[binary-only]` for `semantic_search`; `[official-doc]` for browser surface reduction (3.0).
- **Adoption relevance:** `docs/cursor/02-agent-system.md` tool list; any hook that fires `postToolUse`/`preToolUse` and inspects tool names by string.

### A-08 · Build in Parallel from Plans

- **Description:** "Build in Parallel" quick action on any plan triggers identification of independent steps and runs them simultaneously via async subagents. Dependent steps are kept in order.
- **Version:** 3.3 (May 7, 2026)
- **Evidence:** `[official-doc]`
- **Adoption relevance:** `docs/cursor/08-plan-system.md`; `docs/cursor/02-agent-system.md`.

### A-09 · Split Changes into PRs — Quick Action

- **Description:** New built-in quick action that uses chat context to identify logical PR slices, creates a backup snapshot, and proposes a split plan for approval.
- **Version:** 3.3 (May 7, 2026)
- **Evidence:** `[official-doc]`
- **Adoption relevance:** Workflow-level; relevant to `docs/cursor/13-agents-window.md` quick actions.

### A-10 · `Await` Tool for Agents

- **Description:** Agents can now wait for background shell commands and subagents to complete, or wait for specific output patterns (e.g., "Ready" or "Error").
- **Version:** 3.0 (Apr 2, 2026) — at baseline edge; included because not in 3.0.16 docs
- **Evidence:** `[official-doc]`
- **Adoption relevance:** `docs/cursor/02-agent-system.md`; affects hook testing harnesses.

---

## Section 3 — Rules & AGENTS.md

Adoption-relevance: `docs/cursor/04-rules-and-agentsmd.md`, `docs/cursor/18-adoption-matrix.md`

### R-01 · Context Usage Breakdown — Rules Visibility

- **Description:** New panel showing a breakdown of agent context consumption per category: rules, skills, MCPs, and subagents. Diagnose which rules/files are consuming context budget.
- **Version:** 3.3 (May 6, 2026 — preview; May 7 release)
- **Evidence:** `[official-doc]`
- **Adoption relevance:** `docs/cursor/04-rules-and-agentsmd.md` — helps users right-size rules. Directly informs `docs/cursor/18-adoption-matrix.md` optimization guidance.

### R-02 · Plugins Bundle Rules, Skills, Hooks, MCP, Subagents

- **Description:** Team Marketplace plugins can bundle any combination of MCP servers, skills, subagents, rules, and hooks. Rules are now a first-class deliverable inside plugins. Three distribution modes: Default Off, Default On, Required.
- **Version:** May 1, 2026 (between 3.2 and 3.3)
- **Evidence:** `[official-doc]`
- **Adoption relevance:** `docs/cursor/04-rules-and-agentsmd.md` team distribution section; `docs/cursor/12-plugin-system.md`.

### R-03 · `/Generate Cursor Rules` (confirmed present in 3.x)

- **Description:** Command to auto-generate `.cursor/rules` from codebase patterns. Introduced in 0.49.x but confirmed active at 3.6.21 baseline.
- **Version:** 0.49.x (Apr 2025, pre-scope) — confirmed present at 3.6.21
- **Evidence:** `[community]` (developertoolkit.ai), `[repro-local]` (unverified in this wave)
- **Adoption relevance:** `docs/cursor/04-rules-and-agentsmd.md`.

---

## Section 4 — Skills

Adoption-relevance: `docs/cursor/05-skills.md`, `docs/cursor/18-adoption-matrix.md`

### SK-01 · Pin Skills as Quick Actions

- **Description:** Skills can be pinned as quick-action pills above the chat input for one-click invocation. Persist across sessions and projects.
- **Version:** 3.3 (May 7, 2026)
- **Evidence:** `[official-doc]`
- **Adoption relevance:** `docs/cursor/05-skills.md` — major discoverability improvement for oh-my-cursor skills (hooks, canvas, split-to-prs, etc.).

### SK-02 · `/loop` Skill — Local Long-Running Agent Loop

- **Description:** `/loop` skill runs a prompt repeatedly on a local schedule. If no fixed interval is specified, the agent decides when/what event should wake it. Examples: "check deploy status every 5 minutes", "work on this feature until tests pass."
- **Version:** 3.5 (May 20, 2026)
- **Evidence:** `[official-doc]`
- **Adoption relevance:** `docs/cursor/05-skills.md`; `docs/cursor/06-commands.md`. Directly affects oh-my-cursor's own `loop` skill (`/home/andres/.cursor/skills-cursor/loop/SKILL.md`).

### SK-03 · `/update-cli-config` Skill (CLI)

- **Description:** Native `/update-cli-config` skill applies CLI configuration changes on behalf of the user from within a conversation.
- **Version:** ~3.1 area (Apr 14, 2026 CLI release)
- **Evidence:** `[official-doc]` (mentioned in CLI changelog: "You can also ask Cursor to apply configuration changes for you using the /update-cli-config skill")
- **Adoption relevance:** `docs/cursor/05-skills.md`; `docs/cursor/09-cli.md`.

### SK-04 · Cursor SDK `/sdk` Skill

- **Description:** A native `/sdk` skill helps users start building with `@cursor/sdk`. Bootstraps agent code from within Cursor.
- **Version:** Apr 29, 2026
- **Evidence:** `[official-doc]`
- **Adoption relevance:** `docs/cursor/05-skills.md`.

---

## Section 5 — Commands

Adoption-relevance: `docs/cursor/06-commands.md`, `docs/cursor/18-adoption-matrix.md`

### C-01 · `/multitask` — Async Parallel Subagents

- **Description:** See A-01. Available in Agents Window (3.2) and editor (3.3).
- **Version:** 3.2 (Apr 24, 2026); editor availability 3.3 (May 7, 2026)
- **Evidence:** `[official-doc]`

### C-02 · `/worktree` — Isolated Git Worktree

- **Description:** Spin up an isolated git worktree for the agent's changes. Deprecated previous worktree selection UI.
- **Version:** 3.0 (Apr 2, 2026)
- **Evidence:** `[official-doc]`

### C-03 · `/best-of-n` — Parallel Model Comparison

- **Description:** Runs the same task in parallel across multiple models in separate worktrees, then compares outcomes. Deprecated previous best-of-n selection from Editor.
- **Version:** 3.0 (Apr 2, 2026)
- **Evidence:** `[official-doc]`

### C-04 · `/debug` (CLI) — Debug Mode

- **Description:** CLI `/debug` command generates hypotheses, adds log statements, uses runtime information to pinpoint bugs before making targeted fixes.
- **Version:** ~3.1 area (Apr 14, 2026 CLI release)
- **Evidence:** `[official-doc]`
- **Adoption relevance:** `docs/cursor/09-cli.md`; `docs/cursor/06-commands.md`.

### C-05 · `/btw` (CLI) — Side Question Without Derailing

- **Description:** Ask a quick side question without interrupting the agent's main task. Responses are given without stopping the current run.
- **Version:** ~3.1 area (Apr 14, 2026 CLI release)
- **Evidence:** `[official-doc]`

### C-06 · `/config` (CLI) — Interactive Settings Panel

- **Description:** Opens an interactive settings panel inside the CLI for viewing/changing model choices, defaults, and runtime preferences.
- **Version:** ~3.1 area (Apr 14, 2026 CLI release)
- **Evidence:** `[official-doc]`

### C-07 · `/statusline` (CLI) — Custom Status Bar

- **Description:** Customize the CLI status bar (footer) to surface session/runtime signals: mode, branch, environment, active task hints, session metadata.
- **Version:** ~3.1 area (Apr 14, 2026 CLI release)
- **Evidence:** `[official-doc]`
- **Adoption relevance:** Directly corresponds to oh-my-cursor's `statusline` skill.

---

## Section 6 — MCP

Adoption-relevance: `docs/cursor/07-mcp.md`, `docs/cursor/18-adoption-matrix.md`

### M-01 · `@modelcontextprotocol/sdk` Bundled in Cursor

- **Description:** Official MCP SDK (`@modelcontextprotocol/sdk`) is now bundled in `node_modules` at 3.6.21 (not present in 3.0.16 node_modules). This likely enables deeper, first-party MCP integration paths and reduces per-plugin SDK version conflicts.
- **Version:** unknown (present at 3.6.21; not in any changelog entry)
- **Evidence:** `[binary-only]` `[repro-local]`
- **Adoption relevance:** `docs/cursor/07-mcp.md`; important signal for plugin developers.

### M-02 · MCP Auth Token Lifecycle Improvements

- **Description:** Improved MCP auth token lifecycle handling (3.4); stale token cleanup on re-auth and explicit stale credential handling (3.3); transient 401 handling (3.3, 3.4); large-token handling edge cases fixed (3.4).
- **Version:** 3.3 (May 7, 2026) and 3.4 (May 13, 2026)
- **Evidence:** `[official-doc]`
- **Adoption relevance:** `docs/cursor/07-mcp.md` auth/OAuth section.

### M-03 · MCP Connection Stability Under High Parallelism

- **Description:** Enhanced MCP connection stability when many subagents are running in parallel (relevant with `/multitask`).
- **Version:** 3.3 (May 7, 2026)
- **Evidence:** `[official-doc]`, `[community]` (developertoolkit.ai)
- **Adoption relevance:** `docs/cursor/07-mcp.md`; important for oh-my-cursor MCP sidecar configurations.

### M-04 · MCP Structured Content Support

- **Description:** MCP Apps now support structured content, enabling richer tool outputs beyond plain text.
- **Version:** 3.0 (Apr 2, 2026)
- **Evidence:** `[official-doc]`

### M-05 · Bugbot MCP Support

- **Description:** Bugbot can now access MCP servers for additional context during code reviews. Configurable per team in Bugbot dashboard (Teams/Enterprise).
- **Version:** Apr 8, 2026 (between 3.0 and 3.1)
- **Evidence:** `[official-doc]`
- **Adoption relevance:** `docs/cursor/07-mcp.md` (Bugbot integration notes).

### M-06 · `--add-mcp <json>` CLI Flag — Add MCP Server

- **Description:** CLI flag to add an MCP server definition to user profile, workspace, or folder. Accepts JSON. Companion: `--mcp-workspace` scope flag.
- **Version:** confirmed present at 3.6.21; baseline version unclear (present in `cursor --help` at 3.6.21)
- **Evidence:** `[repro-local]` (captured in cli-facts-3621.md)
- **Adoption relevance:** `docs/cursor/07-mcp.md`; `docs/cursor/09-cli.md`.

---

## Section 7 — Plan System

Adoption-relevance: `docs/cursor/08-plan-system.md`, `docs/cursor/18-adoption-matrix.md`

### P-01 · Build in Parallel from Plans

- **Description:** See A-08. Plans can now dispatch independent steps simultaneously via async subagents with a "Build in Parallel" action.
- **Version:** 3.3 (May 7, 2026)
- **Evidence:** `[official-doc]`
- **Adoption relevance:** Core change to `docs/cursor/08-plan-system.md` execution model.

### P-02 · Plan Tabs Document Behaviors

- **Description:** Plan tabs now behave like file documents: reliable loading, dirty tracking, reload on plan changes, ability to save/copy/export as markdown.
- **Version:** 3.1 (Apr 13, 2026)
- **Evidence:** `[official-doc]`
- **Adoption relevance:** `docs/cursor/08-plan-system.md`.

### P-03 · Plans in Shared Chats

- **Description:** Plans are included in shared chat transcripts alongside the conversation.
- **Version:** 3.0 (Apr 2, 2026)
- **Evidence:** `[official-doc]`

### P-04 · Plan Mode in CLI — Plan/Ask Flags

- **Description:** `cursor --plan "description"` for offline planning; `cursor --ask "question"` for quick queries. Cloud handoff with `&` suffix.
- **Version:** v2.4 (Jan 2026) per community source — pre-scope but relevant if using CLI
- **Evidence:** `[community]` (developertoolkit.ai v2.4 entry; not in official 3.x changelog)
- **Adoption relevance:** `docs/cursor/08-plan-system.md`; `docs/cursor/09-cli.md`.

---

## Section 8 — CLI

Adoption-relevance: `docs/cursor/09-cli.md`, `docs/cursor/18-adoption-matrix.md`

### CL-01 · `--chat` Flag — Standalone Chat Window

- **Description:** New `cursor --chat` flag opens a standalone chat window without the full IDE.
- **Version:** unknown (present at 3.6.21; not in official changelog)
- **Evidence:** `[binary-only]` `[repro-local]` (captured in cli-facts-3621.md)
- **Adoption relevance:** `docs/cursor/09-cli.md`; relevant for quick-access workflows without opening the full IDE.

### CL-02 · `serve-web` Subcommand Removed

- **Description:** The `serve-web` CLI subcommand (present in 3.0.16) is no longer present in 3.6.21.
- **Version:** unknown (absent at 3.6.21)
- **Evidence:** `[binary-only]` `[repro-local]` (cli-facts-3621.md)
- **Adoption relevance:** `docs/cursor/09-cli.md` — remove from docs; any automation using `cursor serve-web` must be updated.

### CL-03 · CLI Debug / btw / config / statusline Commands (Apr 14, 2026)

- **Description:** Four new CLI capabilities: `/debug` (runtime diagnostics + fix), `/btw` (side question), `/config` (interactive settings), `/statusline` (custom footer). See C-04 through C-07.
- **Version:** Apr 14, 2026 (between 3.1 and 3.2)
- **Evidence:** `[official-doc]`
- **Adoption relevance:** `docs/cursor/09-cli.md`.

### CL-04 · CLI Image Paste Support

- **Description:** Image paste from clipboard is now supported in the CLI, including `Ctrl+V` in some terminals without native paste support.
- **Version:** Apr 14, 2026
- **Evidence:** `[official-doc]`

### CL-05 · CLI Footer Shows Working Directory, Worktree, Branch

- **Description:** The CLI footer now shows current working directory, active worktree, and current branch.
- **Version:** Apr 14, 2026
- **Evidence:** `[official-doc]`

### CL-06 · Cursor SDK — `@cursor/sdk`

- **Description:** `npm install @cursor/sdk` provides programmatic access to the same agent runtime powering Cursor IDE. Supports TypeScript, local and cloud execution, SSE streaming, run-scoped cancellation/status. Built-in `/sdk` skill.
- **Version:** Apr 29, 2026
- **Evidence:** `[official-doc]`
- **Adoption relevance:** `docs/cursor/11-cloud-agents-api.md`; opens scripted oh-my-cursor automation possibilities.

### CL-07 · `cursor agent` Subcommand (Present but No Headless Binary on This Host)

- **Description:** `cursor agent --help` subcommand is registered but falls back to IDE usage on this host because `~/.local/bin/agent` is absent. The subcommand is defined for a separate headless agent binary. `cursor agent acp --help` also falls back.
- **Version:** unknown; present at 3.6.21
- **Evidence:** `[binary-only]` `[repro-local]` (cli-facts-3621.md)
- **Adoption relevance:** `docs/cursor/09-cli.md` — current doc must note the headless agent binary is separate and may not be installed.

---

## Section 9 — Settings / Flags

Adoption-relevance: `docs/cursor/15-settings-and-flags.md`, `docs/cursor/18-adoption-matrix.md`

### SF-01 · `disable_local_mode` — New Compile-Time Strip

- **Description:** `__GULPFILE_REMOVE_LINE_BEFORE_COMPILING____disable_local_mode__` is the 42nd entry in `removeLinesBeforeCompilingIfTheyContainTheseWords`. Signals a "local mode" capability that can be compile-time stripped, likely related to restricting local-only execution paths.
- **Version:** unknown (present at 3.6.21)
- **Evidence:** `[binary-only]`
- **Adoption relevance:** `docs/cursor/15-settings-and-flags.md`; may relate to enterprise local-vs-cloud agent routing.

### SF-02 · Model Access Controls (Enterprise)

- **Description:** Granular provider-level and model-level allow/blocklists for admins. Block entire providers, specific model configs (speed, context window size). Option to block new providers/model versions by default. Migration required by June 1, 2026 for existing blocklists.
- **Version:** May 4, 2026
- **Evidence:** `[official-doc]`
- **Adoption relevance:** `docs/cursor/15-settings-and-flags.md` Enterprise section.

### SF-03 · Soft Spend Limits with Usage Alerts

- **Description:** Admins can set soft limits (instead of hard blocking). Automatic alerts at 50%, 80%, 100% thresholds sent to users.
- **Version:** May 4, 2026
- **Evidence:** `[official-doc]`

### SF-04 · Compact Chat Response Density Setting

- **Description:** New "tool call density" setting: Compact / Balanced / Detailed. Controls how much agent tool activity is shown per response. Configurable per user.
- **Version:** 3.4 (May 13, 2026)
- **Evidence:** `[official-doc]`
- **Adoption relevance:** `docs/cursor/15-settings-and-flags.md`; `docs/cursor/13-agents-window.md`.

### SF-05 · Explore Subagent Model Setting

- **Description:** Setting to choose a specific model for Explore subagents, inherit the parent model, or disable Explore subagents entirely. General model names (e.g. `opus`) always resolve to newest model in that family.
- **Version:** 3.3 (May 7, 2026)
- **Evidence:** `[official-doc]`
- **Adoption relevance:** `docs/cursor/15-settings-and-flags.md`; `docs/cursor/02-agent-system.md`.

---

## Section 10 — Notable Items (Non-Priority Areas)

### Glass / Agents Window

| Feature | Version | Evidence |
|---|---|---|
| Agents Window launch (parallel agents, local/cloud/SSH/worktree) | 3.0 (Apr 2, 2026) | `[official-doc]` |
| Tiled layout for parallel agents | 3.1 (Apr 13, 2026) | `[official-doc]` |
| Interactive Canvases (dashboards, tables, charts) | Apr 15, 2026 | `[official-doc]` |
| Shared Canvases (team sharing, read-only Dashboard view) | 3.5 (May 20, 2026) | `[official-doc]` |
| Full-screen tabs (Cmd/Ctrl+Shift+M) | 3.4 (May 13, 2026) | `[official-doc]` |
| Design Mode keyboard navigation | 3.1 (Apr 13, 2026) | `[official-doc]` |
| `--glass` CLI flag ("Enable the multi-workbench architecture dev-only") | present at 3.6.21 | `[repro-local]` |
| `--classic` CLI flag ("Disable glass mode, force classic windows dev-only") | present at 3.6.21 | `[repro-local]` |

### Background / Cloud Agents

| Feature | Version | Evidence |
|---|---|---|
| Multi-root workspaces in Agents Window | 3.2 (Apr 24, 2026) | `[official-doc]` |
| Worktrees in Agents Window (promote branch to local foreground) | 3.2 (Apr 24, 2026) | `[official-doc]` |
| Cloud agent development environments (Dockerfile, multi-repo, build secrets) | 3.4 / May 13, 2026 | `[official-doc]` |
| Environment governance (version history, audit logs, rollback controls) | May 13, 2026 | `[official-doc]` |
| Cursor SDK `@cursor/sdk` (programmatic agent access) | Apr 29, 2026 | `[official-doc]` |
| Cursor in Jira (@Cursor mention → cloud agent) | May 19, 2026 | `[official-doc]` |
| Cursor in Microsoft Teams (@Cursor → cloud agent) | May 11, 2026 | `[official-doc]` |
| Automations in Agents Window (create/manage in-IDE) | 3.5 (May 20, 2026) | `[official-doc]` |
| Multi-repo automations | 3.5 (May 20, 2026) | `[official-doc]` |
| No-repo automations | 3.5 (May 20, 2026) | `[official-doc]` |

### Bugbot

| Feature | Version | Evidence |
|---|---|---|
| Bugbot Learned Rules (auto-learns from PR feedback) | Apr 8, 2026 | `[official-doc]` |
| Bugbot MCP Support (give Bugbot access to MCP servers) | Apr 8, 2026 | `[official-doc]` |
| Bugbot resolution rate 78% | Apr 8, 2026 | `[official-doc]` |
| Bugbot Effort Levels (Default/High/Custom) | May 11, 2026 | `[official-doc]` |
| Bugbot usage-based billing (no seat fees for Teams/Individuals) | May 11, 2026 | `[official-doc]` |
| Cursor Security Review beta (Security Reviewer + Vulnerability Scanner) | Apr 30, 2026 | `[official-doc]` |

### Worktrees

| Feature | Version | Evidence |
|---|---|---|
| `/worktree` command (isolated git worktree) | 3.0 (Apr 2, 2026) | `[official-doc]` |
| `/best-of-n` command (parallel models in separate worktrees) | 3.0 (Apr 2, 2026) | `[official-doc]` |
| Worktrees in Agents Window (background isolation, promote to foreground) | 3.2 (Apr 24, 2026) | `[official-doc]` |
| `cursor-worktree-textmate` extension (worktree-textmate, publisher: everysphere) | present at 3.6.21 | `[repro-local]` |

### Models

| Model / Change | Version | Evidence |
|---|---|---|
| Cursor Composer model family (`composer-1`, `composer-2`, `composer-2.5`, `composer-2.5-fast`) | 2.0 (Oct 2025) for Composer; 2.5 announced May 18, 2026 | `[official-doc]` for 2.5; `[binary-only]` for other slugs |
| Grok models (`grok-3`, `grok-4`, `grok-composer-2`, `grok-composer-2.5`) | unknown (present at 3.6.21) | `[binary-only]` |
| `gpt-5.5` | unknown (present at 3.6.21) | `[binary-only]` |
| `gpt-5.2-codex-high` — REMOVED | unknown (absent at 3.6.21) | `[binary-only]` |
| General model names for subagent config (e.g., `model: opus`) | 3.3 (May 7, 2026) | `[official-doc]` |
| Composer 2.5 — improved long-task handling, complex instructions | May 18, 2026 | `[official-doc]` |

---

## Section 11 — Feature Count by Area

| Area | Feature Count | Notes |
|---|---|---|
| Hooks | 4 | 1 binary-only (workspaceOpen), 1 binary-only (Statsig config), 2 official |
| Agents / Subagents | 10 | 4 binary-only, 6 official |
| Rules & AGENTS.md | 3 | 1 official, 1 official, 1 community |
| Skills | 4 | 3 official, 1 official |
| Commands | 7 | 3 official (3.0/3.1-CLI/3.2/3.3), 4 CLI official |
| MCP | 6 | 1 binary-only, 5 official |
| Plan System | 4 | 3 official, 1 community |
| CLI | 7 | 2 binary-only, 5 official |
| Settings / Flags | 5 | 1 binary-only, 4 official |
| **Notable (Glass/BG/Bugbot/Worktrees/Models)** | ~25 | Various |
| **TOTAL (priority areas)** | **50** | |

---

## Section 12 — Top 5 Most Adoption-Relevant New Features

1. **H-01 · `workspaceOpen` hook event** (v: unknown, present 3.6.21) `[binary-only]`  
   — The canonical hook count changes from 20 → 21. All oh-my-cursor hook tests, the skills system, and `docs/cursor/03-hooks.md` must be updated. Highest-priority gate item.

2. **A-01 · `/multitask` command — async subagent parallelism** (v: 3.2, Apr 24, 2026) `[official-doc]`  
   — Fundamental shift in how agents decompose work. Affects `docs/cursor/02-agent-system.md`, `docs/cursor/06-commands.md`, and the adoption matrix. Enables new parallel skill patterns.

3. **M-01 · `@modelcontextprotocol/sdk` bundled** (v: unknown, present 3.6.21) `[binary-only]`  
   — Official MCP SDK now ships inside Cursor. Signals deeper MCP integration paths and affects how plugin developers depend on the SDK. Update `docs/cursor/07-mcp.md`.

4. **SK-01 · Pin skills as quick actions** (v: 3.3, May 7, 2026) `[official-doc]`  
   — Directly improves discoverability and adoption velocity for oh-my-cursor skills. Skills pinned as quick-action pills persist across sessions. High-value for the oh-my-cursor plugin ecosystem.

5. **P-01 / A-08 · Build in Parallel from Plans** (v: 3.3, May 7, 2026) `[official-doc]`  
   — Plans can now execute their independent steps simultaneously via async subagents. Core change to `docs/cursor/08-plan-system.md` execution model; affects how prometheus/atlas-style multi-wave plans are described.

**Honorable mention:** CL-06 · Cursor SDK `@cursor/sdk` (Apr 29, 2026) — opens programmatic agent automation outside the IDE, highly relevant for oh-my-cursor automation workflows.

---

## Section 13 — Adoption-Relevance Column for `docs/cursor/18-adoption-matrix.md`

The following maps each feature to the adoption matrix rows T3.2 should update:

| Feature ID | adoption-matrix row / area |
|---|---|
| H-01 workspaceOpen | Hooks — canonical event list, test constants |
| H-02 path-length fix | Hooks — known sharp edges |
| H-04 Statsig hook config | Hooks — flags/feature gating |
| A-01 /multitask | Agent system — subagent orchestration |
| A-02 Explore subagent model controls | Agent system — model routing |
| A-03 /multitask controls | Agent system — subagent cost/depth limits |
| A-04 cursor-agent-worker extension | Extension API — first-party extension inventory |
| A-05 cursorPseudoterminal | Extension API — proposed API surface |
| A-06 v2 agent tools | Agent system — tool surface, binary analysis |
| A-07 codebase_search removed | Agent system — tool surface |
| A-08 Build in Parallel | Plan system — execution model |
| R-01 Context Usage Breakdown | Rules — context budgeting guidance |
| R-02 Plugins bundle rules | Plugin system — rules distribution |
| SK-01 Pin skills | Skills — discoverability |
| SK-02 /loop skill | Skills — long-running patterns, CLI |
| SK-03 /update-cli-config | Skills — CLI integration |
| M-01 MCP SDK bundled | MCP — SDK integration |
| M-02 MCP auth improvements | MCP — OAuth/auth |
| M-03 MCP stability | MCP — high-parallelism reliability |
| M-06 --add-mcp CLI flag | MCP — CLI integration |
| P-01 Build in Parallel | Plan system — execution model |
| P-02 Plan tabs as documents | Plan system — plan file behaviors |
| CL-01 --chat flag | CLI — flags |
| CL-02 serve-web removed | CLI — removed flags (breaking) |
| CL-03 /debug /btw /config /statusline | CLI — commands |
| CL-06 Cursor SDK | Cloud agents API |
| SF-01 disable_local_mode | Settings/flags — binary flags |
| SF-04 Compact chat density | Settings/flags — UI settings |
| SF-05 Explore subagent model setting | Settings/flags — agent config |

---

*This fact sheet is read-only input for T3.2. Do NOT edit `docs/cursor/*.md` from here.*
