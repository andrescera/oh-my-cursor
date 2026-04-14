# Hooks

> Cursor 3.0.16. Evidence tags per claim.

---

## Overview

**[official-doc]**

This page summarizes Cursor’s **hooks** system: **agent** hooks (Composer / agent loop) versus **Tab** hooks, **configuration** and **precedence**, **lifecycle** semantics, **third‑party** mapping, how **oh-my-cursor** uses hooks, and **known sharp edges**. Field names in tables are a **behavioral guide** from product documentation and observed usage, not a published JSON Schema—confirm details in current [Cursor documentation](https://cursor.com/docs) before relying on them in production.

- **Purpose:** Observe and control the agent loop by running **spawned processes** that receive **JSON on standard input** (and may emit structured output on stdout where supported).
- **Power:** Hooks can **block** or **modify** agent behavior (tool calls, shell, MCP, file access, prompts, continuation) depending on event type and hook kind (`command` vs `prompt`).
- **Typical uses:** Output **formatters**, **analytics**, **PII / secret scanning**, **gating** risky operations, **subagent** spawn control, and **context injection** back into the session.

---

## Naming reconciliation

**[official-doc]** (config vs. product surfaces)

- **`hooks.json` keys** use **camelCase** (for example `sessionStart`, `preToolUse`, `beforeReadFile`). These are the names you configure under the top-level `hooks` object.
- **Tab hooks vs. agent hooks** use **different event names** (see [Tab Hook Events](#tab-hook-events)). Do not assume `beforeReadFile` applies to Tab file reads, or that Tab events fire for the agent.
- **Docs and internals** may show **PascalCase** labels in examples or metadata (for example guard/transform names in UI or hook output). Treat them as the **same conceptual event** as the camelCase `hooks.json` key unless the product explicitly documents a separate event.

---

## Agent Hook Events

**[official-doc]**

These events apply to the **agent** / Composer loop. Types group how the hook is expected to behave (**Session**, **Guard**, **Transform**, **Continuation**).

| Event | Type | Input fields | Purpose |
|-------|------|--------------|---------|
| `sessionStart` | Session | `session_id`, etc. | Initialize session |
| `sessionEnd` | Session | `session_id` | Cleanup |
| `preToolUse` | Guard | `tool_name`, `tool_input` | Block/allow tool usage |
| `postToolUse` | Guard | `tool_name`, `tool_result` | React to tool results |
| `postToolUseFailure` | Guard | `tool_name`, `error` | Handle failures |
| `beforeShellExecution` | Guard | `command` | Block dangerous commands |
| `afterShellExecution` | Guard | `command`, `exit_code`, `output` | React to shell results |
| `beforeMCPExecution` | Guard | `server_name`, `tool_name` | Block MCP calls |
| `afterMCPExecution` | Guard | `server_name`, `result` | React to MCP results |
| `beforeReadFile` | Guard | `file_path` | Block file reads |
| `afterFileEdit` | Guard | `file_path`, `changes` | React to edits |
| `afterAgentResponse` | Transform | `response` | Process agent output |
| `afterAgentThought` | Transform | `thought` | Process thinking |
| `subagentStart` | Session | `subagent_id`, `subagent_type`, `task`, `subagent_model`, `is_parallel_worker` | Control subagent spawn (allow/deny, **"ask"** treated as deny) |
| `subagentStop` | Session | `summary`, counts, `modified_files` | React to completion |
| `preCompact` | Session | — | Inject context on `/summarize` |
| `stop` | Continuation | — | Handle stop signal |
| `beforeSubmitPrompt` | Continuation | `prompt` | Modify/gate prompts |

**Payload caveat:** Exact JSON shapes and optional fields can change between releases. Use Cursor’s current docs and in-product behavior as the source of truth for schemas.

---

## Tab Hook Events

**[official-doc]**

Tab hooks are **separate** from agent hooks. They fire around **Tab** file operations, not around the same code paths as `beforeReadFile` / `afterFileEdit` on the agent.

| Event | Purpose |
|-------|---------|
| `beforeTabFileRead` | Runs before Tab reads a file |
| `afterTabFileEdit` | Runs after Tab edits a file |

**Important:** `beforeReadFile` and `afterFileEdit` are **agent** events. `beforeTabFileRead` and `afterTabFileEdit` are **Tab** events—different names, different scope.

---

## Hook Configuration

**[official-doc]**

- **File:** `.cursor/hooks.json` (project) or `~/.cursor/hooks.json` (user), plus enterprise sources (below).
- **`version`:** `1`.
- **Shape:** A **`hooks`** object whose keys are **event names**; each key maps to an **array** of hook definitions run for that event.
- **Common definition fields:**
  - **`command`:** Executable invoked for **`type: "command"`** (default when `type` is omitted).
  - **`matcher`:** Regular expression matched against a **tool name**, **file path**, or other event-specific target—only definitions whose matcher matches (or with no matcher) are candidates to run.
  - **`failClosed`:** Boolean; when **true**, failure modes tend to **deny** rather than **allow** (stricter posture when the hook errors or is inconclusive—confirm semantics in current docs).
  - **`loop_limit`:** Limits how many times a hook may run per logical loop; **`null`** can mean “no limit” in configurations that support it.
  - **`type`:** `"command"` or **`"prompt"`** (model-driven hook).
  - **`model`:** Model selector for **prompt** hooks where supported.
  - **`timeout`:** Bound execution time for the hook.
  - **`prompt`:** Template / instructions for **`type: "prompt"`** hooks (may include placeholders such as arguments, per product docs).
- **Command hooks — exit codes:** Exit **`0`** → **allow**; exit **`2`** → **block**; **other** exit codes → **fail-open** (allow) unless `failClosed` or product rules state otherwise.
- **Prompt hooks — output:** Return **JSON** including a **permission** (`allow` / `deny`) and an optional **reason** string.

---

## Lifecycle

**[official-doc]**

1. **Trigger:** When an event fires (tool call, shell line, MCP call, session boundary, etc.), Cursor gathers the **payload** for that event.
2. **Selection:** Hook definitions for that event are filtered by **source precedence** (see [Priority Chain](#priority-chain)) and by **`matcher`** when present.
3. **Execution:** Each selected hook runs as a **separate process** (command) or **model invocation** (prompt). **Command** hooks typically receive **JSON on stdin**; **stdout** may carry hook-specific structured responses where the product defines them.
4. **Effect:** **Guard**-style hooks can **block** the operation or **inject** additional context; **transform** hooks observe or reshape outputs; **session** hooks establish or tear down state; **continuation** hooks influence stop / prompt submission behavior.
5. **Reload:** Hook configuration is **reloaded when hook files change** (auto-reload), so edits to `hooks.json` can take effect without restarting the editor in typical setups.

---

## Priority Chain

**[official-doc]**

From **highest** to **lowest** precedence:

1. **Enterprise MDM**-managed hooks  
2. **Team** hooks from the **dashboard**  
3. **Project** `.cursor/hooks.json`  
4. **User** `~/.cursor/hooks.json`

**[changelog]**

- **Multi-root workspaces:** Hooks are loaded from **all workspace roots** (behavior fixed in **3.0**-era releases; older versions were inconsistent for multi-root).

**[official-doc]**

- **Auto-reload** when hook configuration files change.

---

## Cloud / Enterprise Hooks

**[official-doc]**

- **Repository hooks in cloud** environments (where Cursor runs agents against cloud-hosted repos).
- **Enterprise team hooks** configured via the **team dashboard**.
- **Enterprise-managed hooks** delivered through **MDM** (mobile device management / enterprise policy), which sit at the top of the [Priority Chain](#priority-chain).

---

## Third-Party Hook Mapping

**[official-doc]**

- **Claude Code**-style hooks can be **mapped** through **Settings → Third-party skills** (or equivalent UI path in your Cursor version).
- **Gaps:** Some Claude events and tools are **unsupported** or **not mapped**. Examples called out in product discussions include **Glob**, **WebFetch**, and **WebSearch**—treat third-party parity as **best-effort**, not one-to-one.

---

## oh-my-cursor Usage

**Repo-local** (paths relative to this repository)

- **Coverage:** **18** agent hook events are wired to a **Bun HTTP daemon** via shell stubs in the bundled [`hooks/hooks.json`](../../hooks/hooks.json) (see also [`docs/cursor-features.md`](../cursor-features.md)).
- **Options used:** `command`, `matcher`, `failClosed`, `loop_limit`, and **`type: "prompt"`** (secondary guard on `beforeMCPExecution` alongside the command hook).
- **Handlers (summary):** Session **tracking**, **context injection** (for example after tools / compaction), **dangerous command** gating (`beforeShellExecution` with `failClosed`), **dispatch / loop limits**, and **continuation** control (`stop`, `beforeSubmitPrompt`).
- **Tab hooks:** **Not** used—only agent events are registered.

---

## Known issues / sharp edges

**[community]**

- **`beforeShellExecution`:** **Malformed JSON** into the hook has been reported to **fail open** (treated as allow)—treat as a **bug** risk if you rely on strict blocking.

**[staff-forum]**

- **`afterAgentThought`:** Behavior around **model / type** fields in the payload has been **unclear** or inconsistent in reports; verify against your Cursor version if you depend on this event.

**[community]**

- **Windows:** **UTF-8** encoding issues with hook **stdio** have been reported; normalize encodings and test on Windows if you ship cross-platform hook scripts.
- **Hook detection:** Hooks may **not** be picked up **immediately** after **creating** the hooks file; a reload or brief delay may be needed.

---

## See also

- [Cursor documentation — Hooks](https://cursor.com/docs) (current product source)
- [`hooks/hooks.json`](../../hooks/hooks.json) — oh-my-cursor event wiring
- [Agent system](02-agent-system.md) — subagents and Task tool context
