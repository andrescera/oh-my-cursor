# Help

oh-my-cursor uses a **dispatcher root**: the main chat thread only delegates work via the Task tool (plus TodoWrite, AskQuestion, SwitchMode). It does not edit, read, or search the codebase itself. Coordinators and workers are defined in `packages/oh-my-cursor/rules/orchestrator.mdc` (routing table, batching, and lifecycle).

## Agents

| Agent | Model | Description |
|-------|-------|-------------|
| atlas | claude-4.6-sonnet-medium-thinking | Executes an existing plan step-by-step via delegation; does not implement directly. |
| explore | gemini-2.5-flash | Codebase search and structure questions; read-only, often background. |
| hephaestus | gpt-5.4 | Sustained deep work on one complex problem until end-to-end completion. |
| librarian | kimi-k2.5 | External docs, APIs, OSS examples; read-only. |
| metis | claude-4.6-opus-max-thinking | Pre-planning gap analysis and risks; read-only. |
| momus | gpt-5.4 | Reviews plans for executability and completeness; read-only. |
| multimodal-looker | gemini-3.1-pro | PDFs, images, diagrams when plain-text read is not enough. |
| oracle | gpt-5.4 | Architecture and debugging consultation; read-only. |
| prometheus | claude-4.6-opus-max-thinking | Detailed planning only; never implements. |
| sisyphus-junior | claude-4.6-sonnet-medium-thinking | Small bounded tasks; leaf worker; no sub-delegation. |
| sisyphus | claude-4.6-opus-max-thinking | Main coordinator for complex multi-file work and execution. |

## Slash commands

| Command | Description |
|---------|-------------|
| `/briareus` | Split work into many tiny parallel tasks; dispatch multiple sisyphus-junior workers. |
| `/cancel-ralph` | Stop the active Ralph loop (same idea as stopping continuation for Ralph). |
| `/deep-plan` | Run prometheus plus explore and metis; write plan under `.cursor/plans/`; optional momus review. |
| `/handoff` | Produce a handoff doc for a new session (explore plus sisyphus-junior synthesis). |
| `/help` | This overview: agents, commands, skills, and usage patterns. |
| `/init-deep` | Parallel explore passes to create or refresh root `AGENTS.md`. |
| `/ralph-loop` | Continuation loop until `<promise>DONE</promise>` or cancel. |
| `/refactor` | Sisyphus-led refactor with exploration, plan, incremental verify. |
| `/remove-ai-slops` | Branch diff files cleaned in parallel with the ai-slop-remover skill. |
| `/start-work` | Atlas loads a plan from `.sisyphus/plans/` or `.cursor/plans/` and executes it. |
| `/stop-continuation` | Stop Ralph, ultrawork, and other continuation mechanisms. |
| `/ulw-loop` | Deep loop with oracle checks between milestones until DONE or cancel. |

## Skills

Skills live under `packages/oh-my-cursor/skills/<name>/SKILL.md`. Load when the task matches the triggers.

- **agent-browser**: Web testing, navigation, forms, screenshots, extracting page data.
- **ai-slop-remover**: One file at a time; remove noisy comments, generic names, shallow abstractions; parallelize per file for batches.
- **dev-browser**: Scripted browser automation with state; triggers like go to URL, click, fill form, screenshot, scrape, automate, log in.
- **frontend-ui-ux**: Strong UI and UX without mockups; layout, polish, and visual hierarchy.
- **git-master**: Any git workflow; triggers include commit, rebase, squash, blame, bisect, log -S, who changed what.
- **playwright**: Headless or MCP Playwright for E2E, scraping, and form flows.
- **review-work**: After a plan is implemented; five parallel reviewers for quality and coverage.

## Quick reference

For complex or ambiguous work use `/deep-plan` (then confirm and `/start-work`). For a small, clear change, describe it and route to a quick executor per orchestrator rules.

## Common patterns

- **Where or how in the repo?** explore (one batched dispatch per related scope).
- **Library or external API?** librarian.
- **Need a plan first?** prometheus (and metis when risks are unclear); **plan already approved?** atlas via `/start-work`.
- **Large multi-file feature or fix?** sisyphus. **Single file or tight scope?** sisyphus-junior.
- **One hard problem for a long stretch?** hephaestus. **Images or PDFs?** multimodal-looker.
- **Second opinion on design or bugs?** oracle. **Audit a prometheus plan?** momus.
