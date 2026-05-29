# Commands

> Cursor 3.0.16. Evidence tags per claim.

Evidence tags: `[official-doc]`, `[changelog]`, `[repro-local]`, `[binary-only]`, `[community]`.

## Custom slash commands

Slash commands can be supplied from:

- Project: `.cursor/commands/` [official-doc]
- User: `~/.cursor/commands/` [official-doc]
- Cursor plugins: command definitions bundled with a plugin [official-doc]

## Built-in Cursor commands (selection)

| Command | Notes | Evidence |
|---------|--------|----------|
| `/create-rule` | Create or refine project rules | [inherited-from-2.x] |
| `/create-skill` | Create or refine Agent Skills | [inherited-from-2.x] |
| `/migrate-to-skills` | Migration helper toward Skills | [inherited-from-2.x] |
| `/worktree` | Isolated git worktree flow for agent work | [changelog 3.0] |
| `/best-of-n` | Parallel model runs in separate worktrees | [changelog 3.0] |
| `/plan` | Plan-oriented composer flow | [official-doc] |
| `/ask` | Ask-mode (read-only) orientation | [official-doc] |

## oh-my-cursor command set (16)

This project documents **16** orchestration and utility commands:

- **Orchestration:** `/plan`, `/start-work`, `/briareus`, `/refactor`, `/init-deep`, `/handoff` [repro-local]
- **Monitoring:** `/status`, `/agents`, `/help` [repro-local]
- **Config:** `/config` [repro-local]
- **Continuation:** `/ralph-loop`, `/ulw-loop`, `/cancel-ralph`, `/stop-continuation`, `/remove-ai-slops` [repro-local]
- **Experimental:** `/cloud-agents` [repro-local]

These are **project-defined** Cursor commands (see plugin `commands/`), not a guarantee of stock Cursor behavior.

---

## Cursor 3.1 → 3.6 changes

New and changed commands introduced between Cursor 3.1 (Apr 13, 2026) and 3.6.21 (2026-05-28).  
Evidence tags follow the same convention as the rest of this document.

### IDE slash-commands (Agents Window / editor)

| ID | Command | Description | Version | Evidence |
|----|---------|-------------|---------|----------|
| C-01 | `/multitask` | Spawns async subagents in parallel; Cursor decomposes the task and assigns independent chunks to separate subagents. Queued messages can be redirected mid-run. Exposes Explore-subagent controls (max depth, concurrency ceiling, cost ceiling) since 3.3. | 3.2 — Agents Window (Apr 24, 2026); 3.3 — editor (May 7, 2026) | `[official-doc]` |
| C-02 | `/worktree` | Spins up an isolated git worktree for the agent's changes; deprecates the previous worktree-selection UI. | 3.0 (Apr 2, 2026) | `[official-doc]` |
| C-03 | `/best-of-n` | Runs the same task in parallel across multiple models in separate worktrees, then compares outcomes; deprecates the previous best-of-n selection from Editor. | 3.0 (Apr 2, 2026) | `[official-doc]` |

> **Note:** C-02 and C-03 were introduced at the 3.0 boundary (docs baseline was 3.0.16) and are included here for completeness because they were absent from the pre-3.x docs.

### CLI commands

These four commands are available inside the Cursor CLI (not the IDE chat input). Shipped together in the Apr 14, 2026 CLI release (between 3.1 and 3.2).

| ID | Command | Description | Version | Evidence |
|----|---------|-------------|---------|----------|
| C-04 | `/debug` | Generates hypotheses, injects log statements, and uses runtime information to pinpoint bugs before making targeted fixes. | ~3.1 (Apr 14, 2026 CLI release) | `[official-doc]` |
| C-05 | `/btw` | Ask a quick side question without interrupting the agent's main task; responses are returned without stopping the current run. | ~3.1 (Apr 14, 2026 CLI release) | `[official-doc]` |
| C-06 | `/config` | Opens an interactive settings panel inside the CLI for viewing and changing model choices, defaults, and runtime preferences. | ~3.1 (Apr 14, 2026 CLI release) | `[official-doc]` |
| C-07 | `/statusline` | Customizes the CLI status bar (footer) to surface session/runtime signals: mode, branch, environment, active task hints, session metadata. Corresponds to the oh-my-cursor `statusline` skill. | ~3.1 (Apr 14, 2026 CLI release) | `[official-doc]` |
