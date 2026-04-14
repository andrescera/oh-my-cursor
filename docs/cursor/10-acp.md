# Agent Control Protocol (ACP)

> Cursor 3.0.16. Evidence tags per claim.

Evidence tags: `[official-doc]`, `[changelog]`, `[repro-local]`, `[binary-only]`, `[community]`.

## Overview

ACP is a **JSON-RPC** protocol that lets **external clients** drive Cursor’s agent session (CLI and editor-backed behavior as documented). [official-doc]

## Entry point

Start an ACP server with **`cursor agent acp`** (documented CLI surface; local installs also expose **`agent acp`** on the headless `agent` binary). [official-doc] + [repro-local]

## Session modes

ACP sessions support **`agent`**, **`plan`**, and **`ask`**. **Debug** is **not** available over ACP in Cursor’s documentation. [official-doc]

## Methods (documented)

Examples called out in Cursor’s ACP documentation include:

- `cursor/ask_question`
- `cursor/create_plan`
- `cursor/update_todos`
- `cursor/task`
- `cursor/generate_image`

[official-doc]

## Editor / community integrations

Cursor documents or links ecosystem usage such as **avante.nvim**, **JetBrains**, and **Zed** in the ACP context. [official-doc]

## MCP under ACP

For ACP-driven sessions, MCP usage is constrained relative to the full IDE: **project** and **user** MCP configurations apply; **team** dashboard–centric MCP wiring is **not** supported as described in docs. [official-doc]

## oh-my-cursor

ACP is a **Could Use** integration point for headless orchestration (no dependency assumed in core flows). [repro-local]
