# Help

oh-my-cursor uses a **dispatcher root**: the main chat thread only delegates work via the Task tool (plus TodoWrite, AskQuestion, SwitchMode). It does not edit, read, or search the codebase itself. Coordinators and workers are defined in `rules/orchestrator.mdc` (routing table, batching, and lifecycle).

## Agents

| Agent | Model | Description |
|-------|-------|-------------|
| atlas | claude-4.6-sonnet-medium-thinking | Executes an existing plan step-by-step via delegation; does not implement directly. |
| explore | composer-2-fast | Codebase search and structure questions; read-only, often background. |
| hephaestus | gpt-5.3-codex-high-fast | Sustained deep work on one complex problem until end-to-end completion. |
| librarian | composer-2-fast | External docs, APIs, OSS examples; read-only. |
| metis | gpt-5.4-medium | Pre-planning gap analysis and risks; read-only. |
| momus | gpt-5.3-codex-high-fast | Reviews plans for executability and completeness; read-only. |
| multimodal-looker | gemini-3.1-pro | PDFs, images, diagrams when plain-text read is not enough. |
| oracle | gpt-5.4-medium | Architecture and debugging consultation; read-only. |
| prometheus | claude-opus-4-7-thinking-high | Detailed planning only; never implements. |
| sisyphus-junior | composer-2-fast | Small bounded tasks; leaf worker; no sub-delegation. |
| sisyphus | claude-opus-4-7-thinking-high | Main coordinator for complex multi-file work and execution. |

Cursor's Task tool accepts only these model slugs at runtime (enum-enforced).

## Slash commands

### Orchestration

| Command | Description |
|---------|-------------|
| `/plan` | Switch to Plan mode (Prometheus persona); research via explore/metis; write plan to `.cursor/plans/`; optional Momus review. |
| `/start-work` | Execute a plan from `.cursor/plans/` — native mode (root=Atlas) or subagent mode (Task atlas). |
| `/briareus` | Split work into many tiny parallel tasks; dispatch multiple sisyphus-junior workers. |
| `/refactor` | Sisyphus-led refactor with exploration, plan, incremental verify. |
| `/init-deep` | Parallel explore passes to create or refresh root `AGENTS.md`. |
| `/handoff` | Produce a handoff doc for a new session (explore plus sisyphus-junior synthesis). |

### Monitoring

| Command | Description |
|---------|-------------|
| `/status` | System health: daemon uptime, sessions, tool calls, sidecar status. |
| `/agents` | List all agents with models, roles, and capabilities. |
| `/help` | This overview: agents, commands, skills, and usage patterns. |

### Configuration

| Command | Description |
|---------|-------------|
| `/config` | Display the current merged oh-my-cursor configuration. |

### Experimental

| Command | Description |
|---------|-------------|
| `/cloud-agents` | Dispatch and manage agents via cloud API (requires experimental.cloud_agents). |

### Continuation

| Command | Description |
|---------|-------------|
| `/ralph-loop` | Continuation loop until `<promise>DONE</promise>` or cancel. |
| `/ulw-loop` | Deep loop with oracle checks between milestones until DONE or cancel. |
| `/cancel-ralph` | Stop the active Ralph loop. |
| `/stop-continuation` | Stop Ralph, ultrawork, and other continuation mechanisms. |
| `/remove-ai-slops` | Branch diff files cleaned in parallel with the ai-slop-remover skill. |

## Skills

Skills live under `skills/<name>/SKILL.md`. Load when the task matches the triggers.

- **agent-browser**: Web testing, navigation, forms, screenshots, extracting page data.
- **ai-slop-remover**: One file at a time; remove noisy comments, generic names, shallow abstractions; parallelize per file for batches.
- **dev-browser**: Scripted browser automation with state; triggers like go to URL, click, fill form, screenshot, scrape, automate, log in.
- **frontend-ui-ux**: Strong UI and UX without mockups; layout, polish, and visual hierarchy.
- **git-master**: Any git workflow; triggers include commit, rebase, squash, blame, bisect, log -S, who changed what.
- **playwright**: Headless or MCP Playwright for E2E, scraping, and form flows.
- **review-work**: After a plan is implemented; five parallel reviewers for quality and coverage.

## Quick reference

For complex or ambiguous work use `/plan` (then confirm and `/start-work`). For a small, clear change, describe it and route to a quick executor per orchestrator rules.

## Common patterns

- **Where or how in the repo?** explore (one batched dispatch per related scope).
- **Library or external API?** librarian.
- **Need a plan first?** prometheus (and metis when risks are unclear); **plan already approved?** atlas via `/start-work`.
- **Large multi-file feature or fix?** sisyphus. **Single file or tight scope?** sisyphus-junior.
- **One hard problem for a long stretch?** hephaestus. **Images or PDFs?** multimodal-looker.
- **Second opinion on design or bugs?** oracle. **Audit a prometheus plan?** momus.
