# Modes & Switching

> Cursor 3.6.21 (cursor-bin 3.6.21-1, vscodeVersion 1.105.1, commit e7a7e93f4d75f8272503ecf33cedbaae10114a10). Evidence tags: [official-doc], [changelog], [repro-local], [binary-only], [community]. Re-audited 2026-05-29; claims carry per-claim `last-verified` markers — unmarked claims retain their 3.0.16 baseline and were not re-verified at 3.6.21.

This document summarizes how **modes** work in Cursor 3.x, how you can switch between them on different surfaces, and what is (and is not) possible programmatically. Evidence tags indicate how each claim is supported; items marked [binary-only] or [community] are **not** treated as stable, documented product behavior.

## The four user-facing modes (+ internal background)

- **Agent** — Default. Builds, edits, runs shell, spawns subagents, generates images, queues messages. [official-doc]

- **Ask** — Read-only. No file modifications. [official-doc]

- **Plan** — Research and plan before build. Plans default to the home directory (`~/.cursor/plans/`); workspace save is optional (“Save to workspace”). After plan approval, the session can proceed to editing and implementation. [official-doc]

- **Debug** — Hypotheses, instrumentation, debug server, logs, fix, and verify in a structured cycle. [official-doc]

- **Background** — **Not** a user-selectable mode. Internal mode associated with background agents (e.g. traces referencing `createdFromBackgroundAgent`). Treat as implementation detail unless Cursor documents it publicly. [binary-only]

## Switching matrix

How each surface maps to modes. “No” means that surface does not expose that mode in the way described.

| Surface | Plan | Agent | Ask | Debug | Background | Evidence |
|---------|------|-------|-----|-------|------------|----------|
| Desktop UI picker | Yes | Yes | Yes | Yes | No | [official-doc] |
| Shift+Tab | Yes (cycles) | Yes | Yes | Yes | No | [official-doc] |
| CLI `--mode` | `--mode=plan` | Default | `--mode=ask` | Not available | No | [official-doc] |
| CLI `--plan` flag | Yes | No | No | No | No | [official-doc] |
| ACP session modes | plan | agent | ask | NOT available | No | [official-doc] |
| SwitchMode tool (in-agent) | plan | agent | ask | Cannot switch **to** debug | No | [repro-local] |
| `keybindings.json` | `composerMode.agent` (Ctrl+I) | `composerMode.agent` | N/A | N/A | N/A | [repro-local] |
| `cursor.composer.shouldAllowCustomModes` | Unknown effect | Unknown | Unknown | Unknown | Unknown | [repro-local] |

## Programmatic mode switching

### SwitchMode tool (in-chat)

Available to agents inside a chat session. Can switch to **plan**, **agent**, and **ask**. **Cannot** switch **to** Debug from this tool — Debug appears to be UI-entered only for mode selection. [official-doc] + [repro-local]

### CLI

The `--mode` flag supports **plan** and **ask**; **agent** is the default when not specified. **Debug** is not available via this flag. [official-doc]

### ACP (Agent Client Protocol)

JSON-RPC session modes include **agent**, **plan**, and **ask**. **Debug** is **not** in the ACP mode list as documented for session configuration. [official-doc]

### Extensions and third parties

There is **no** public VS Code–style extension API documented for **SwitchMode** as used in Cursor Chat. **Kilo Code** `switch_mode` (or similar) refers to a **different product**; do not assume parity with Cursor. [community]

### Context and session behavior

Switching modes effectively starts from a **fresh** conversational context for the new mode’s workflow; product guidance often recommends a **new chat** for new tasks rather than overloading one thread. [official-doc]

## oh-my-cursor usage

This repository’s orchestration patterns align with the above as follows (convention in rules/commands, not a Cursor API guarantee):

- **SwitchMode(plan)** — Prometheus / planning persona (e.g. `/plan`).
- **SwitchMode(agent)** — Atlas / execution persona (e.g. `/start-work`).
- **SwitchMode(ask)** — Read-only agents (e.g. metis, momus, oracle) where edits must not occur.
- **SwitchMode(debug)** — Referenced for error-focused flows (e.g. sisyphus/hephaestus); **entering** Debug may still require the UI where the in-agent tool cannot target it. [repro-local]

Command wiring (illustrative):

- **`/plan`** — Triggers **SwitchMode(plan)**.
- **`/start-work`** — Triggers **SwitchMode(agent)**.

## Limitations & open questions

1. **Debug** is only reliably **selectable via the desktop UI** (picker / keyboard cycle). Programmatic or CLI/ACP paths documented for other modes do not list Debug the same way. [official-doc] [repro-local]

2. **`cursor.composer.shouldAllowCustomModes`** — Appears in local settings/history in some installs; **effect is unknown** and should not be relied on without verifying in your Cursor build. [repro-local]

3. **Background** mode is **internal** (background agents), **not** user-selectable alongside Agent/Ask/Plan/Debug. [binary-only]

4. **No documented way** for an extension to **query the current chat mode** programmatically like a first-class API (contrast with reading UI state or unofficial hooks). Treat as an open gap unless Cursor publishes an API. [repro-local]

5. Anything inferred from **binaries** or **community** repos is **exploratory** — validate against [official-doc] or your own [repro-local] run before baking into product behavior.

---

*Version note: This file targets Cursor **3.x** (stated baseline 3.0.16). Behavior in older major versions may differ; if you document 2.x behavior here, tag it [inherited-from-2.x].*
