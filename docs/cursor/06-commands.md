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
