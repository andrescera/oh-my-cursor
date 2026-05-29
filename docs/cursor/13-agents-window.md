# Agents Window

> Cursor 3.0.16. Evidence tags per claim.

Evidence tags: `[official-doc]`, `[changelog]`, `[repro-local]`, `[binary-only]`, `[community]`.

## Agents Window (3.0)

**Cursor 3.0** introduces the **Agents Window**: an **agent-first** UI surface with **parallel agents**, **multi-workspace** support, and **Command Palette** entry points as described in release notes. [changelog 3.0]

## Agent Tabs

**Agent Tabs** ship in **3.0**, with a **tiled layout** refinement called out for **3.1** in changelog material. [changelog 3.1]

## Design Mode

**Design Mode** is introduced in **3.0** with interactions such as **Cmd+Shift+D**, **Shift+drag**, and **Cmd+L** for design-oriented manipulation (per changelog copy). [changelog 3.0]

## Voice input (3.1)

**Voice input** in **3.1** includes **Ctrl+M**, a **waveform** UI, and **batch STT** (speech-to-text) behavior per release notes. [changelog 3.1]

## Branch selection (3.1)

**Branch selection** for agent workflows is called out in **3.1** changelog entries. [changelog 3.1]

## oh-my-cursor

Agents Window features are **Could Use** for this project (optional UX alignment; no hard dependency). [repro-local]

## Cursor 3.1 → 3.6 changes

### A-09 · Split Changes into PRs (v3.3) `[official-doc]`

New built-in quick action that uses chat context to identify logical PR slices, creates a backup snapshot, and proposes a split plan for approval before executing. Corresponds to the oh-my-cursor `split-to-prs` skill.

### Glass / Agents Window

| Feature | Version | Evidence |
|---|---|---|
| Agents Window launch (parallel agents, local/cloud/SSH/worktree) | 3.0 (Apr 2, 2026) | `[official-doc]` |
| Tiled layout for parallel agents | 3.1 (Apr 13, 2026) | `[official-doc]` |
| Multi-root workspaces in Agents Window | 3.2 (Apr 24, 2026) | `[official-doc]` |
| Worktrees in Agents Window (promote branch to local foreground) | 3.2 (Apr 24, 2026) | `[official-doc]` |
| Full-screen tabs (Cmd/Ctrl+Shift+M) | 3.4 (May 13, 2026) | `[official-doc]` |
| Automations in Agents Window (create/manage in-IDE) | 3.5 (May 20, 2026) | `[official-doc]` |
| `--glass` CLI flag (multi-workbench architecture, dev-only) | present at 3.6.21 | `[repro-local]` |
| `--classic` CLI flag (disable glass mode, force classic windows, dev-only) | present at 3.6.21 | `[repro-local]` |

### SF-04 · Compact Chat Response Density (v3.4) `[official-doc]`

New "tool call density" setting: **Compact / Balanced / Detailed**. Controls how much agent tool activity is shown per response. Configurable per user. See also `docs/cursor/15-settings-and-flags.md`.
