# Agent System

> Cursor 3.0.16. Evidence tags per claim.

This page describes Cursor’s **Agent** experience, **subagents** (Task tool), **custom agent definitions**, how **oh-my-cursor** uses them, and known **limitations**. Unless a tag says otherwise, treat behavioral details as **product documentation paraphrase**, not a formal API spec.

---

## Agent Mode

**[official-doc]**

- **Opening Agent chat:** macOS **Cmd+I** / Windows and Linux **Ctrl+I** opens the Agent (Composer) interface.
- **Typical tool surface:** Agents can use capabilities such as **codebase search**, **file search**, **web search**, **rules fetch**, **read** (including images where supported), **edit**, **terminal / shell**, **browser** (when enabled), **image generation** (with default output under `assets/` where applicable), and **ask-user / clarification** style interactions. Exact availability depends on product settings, plan, and session mode.
- **Checkpoints:** The agent workflow can create **checkpoints** so you can **revert** changes made during a session.
- **Queued messages:** **Enter** can **queue** a follow-up message while the agent is busy; **Cmd+Enter** (platform-specific equivalent on Windows/Linux where documented) sends for **immediate** handling where supported.
- **Model selection:** You can choose the **model per chat** / session from the UI.

**Unverified / product-dependent:** Exact keybindings for “immediate send” on all platforms, and which tools appear in a given workspace, should be confirmed in current in-app help or [Cursor documentation](https://cursor.com/docs).

---

## Subagents / Task Tool

**[official-doc]** (behavioral summary)

- **Isolated context:** A subagent run does **not** automatically see the parent’s full transcript. The **parent must put everything needed** (paths, constraints, acceptance criteria) into the **Task `prompt`** (and related fields).
- **Foreground vs background:**
  - **Foreground** (`run_in_background: false`): the **parent blocks** until the subagent finishes (or errors).
  - **Background** (`run_in_background: true`): dispatch **returns immediately**; the parent polls or awaits completion via mechanisms the product exposes (e.g. output file / task id in the UI).
- **Nested subagents:** Nesting subagents (a subagent launching another) is supported from **Cursor 2.5+** onward. **[changelog]**
- **Custom subagent types:** You can define additional worker types as Markdown files under **`.cursor/agents/*.md`** (and optionally user-level **`~/.cursor/agents/`**), which then appear as **`subagent_type`** values for the Task tool.
- **Tool inheritance:** Subagents **inherit the parent’s tool set**, including **MCP-connected tools**, subject to `readonly` and product policy. **[official-doc]**

### Task tool parameters (research capture)

The following is a **field guide** compiled from **observed Cursor behavior, UI copy, and agent-facing tool descriptions**. It is **not** a published JSON Schema and may **change between releases**. Do not treat this table as a stable API contract.

| Parameter | Summary |
|-----------|---------|
| `model` | Use **`inherit`** (parent’s model), a **tier** such as **`fast`**, or a **specific model id** string where the product accepts it. |
| `subagent_type` | **Built-in** worker kinds (e.g. explore vs implementation-oriented types) or a **custom** type name matching an agent definition file. |
| `run_in_background` | If **true**, parent does not block on completion; if **false**, parent waits on the subagent run. |
| `readonly` | When **true**, restricts **mutating** tools (edits, writes, some shell operations) per product rules. |
| `resume` | **Agent / task id** string to **continue** a prior subagent invocation instead of starting cold. |
| `attachments` | **File paths** (e.g. video) passed into multimodal-capable subagent flows where supported. |
| `description` | **Short summary** shown in logs / UI for the task. |
| `prompt` | **Full task instructions** for the subagent; must be self-contained. |

**[research]** Parameter names, optionality, and validation rules are **not** publicly documented as a schema (see [Limitations](#limitations)).

---

## Custom Agent Definitions

**[official-doc]** (conceptual)

- **Format:** Markdown files with **YAML frontmatter**, usually under **`.cursor/agents/`** or **`~/.cursor/agents/`**.
- **Common frontmatter fields** (names and semantics as used in Cursor’s agent-definition flow):
  - **`name`:** Identifier / display name for the agent type.
  - **`description`:** Natural-language **routing hint**; the **orchestrating model** uses this to decide **when to delegate** to this agent.
  - **`model`:** **`inherit`**, **`fast`**, or a **specific** model identifier.
  - **`readonly`:** Marks definitions intended for **read-only** / safer tooling.
  - **`is_background`:** Marks definitions that default to or prefer **background** Task runs where applicable.
- **Plugins:** Cursor plugins can ship agent definitions via the plugin manifest. In **oh-my-cursor**, the manifest uses an **`agents`** key pointing at the bundled **`./agents/`** directory (see `.cursor-plugin/plugin.json` in this repo). Other plugins or Cursor versions may use a different manifest shape; confirm against current Cursor plugin docs. **[official-doc]** (mechanism) + **repo-local** (concrete example)

---

## oh-my-cursor Usage

**Repo-local** (paths relative to this repository)

- **Custom agents:** **11** specialized agents live under [`agents/*.md`](../../agents/).
- **Orchestrator routing:** High-level persona and dispatch expectations are defined in [`rules/orchestrator.mdc`](../../rules/orchestrator.mdc).
- **Tiers:** Coordinators (**sisyphus**, **hephaestus**, **atlas**) are intended to **spawn** focused workers (**explore**, **sisyphus-junior**, **librarian**, etc.) according to task shape and the orchestrator rule text.
- **Model routing:** Workspace rules describe **dynamic model selection** by **task complexity** (fast vs more capable models); see orchestrator and agent frontmatter.
- **Dispatch latency:** Experimental notes and measurements live in [`docs/internal/subagent-latency-research.md`](../internal/subagent-latency-research.md).

---

## Cursor 3.1 → 3.6 Changes

Feature deltas for the agent/subagent surface from Cursor 3.1 (Apr 13, 2026) through 3.6.21 (binary date 2026-05-28). Full evidence in `docs/internal/reaudit-3621/feature-discovery-3.1-3.6.md` Section 2. Evidence tags per claim.

### A-01 · `/multitask` — Async Subagent Parallelism

**[official-doc]** · v3.2 (Apr 24, 2026)

- `/multitask` spawns async subagents **in parallel** rather than queuing requests sequentially. Cursor automatically decomposes larger tasks into smaller chunks and assigns each to its own subagent.
- Queued messages can be redirected to multitask execution mid-run.
- **v3.3 extension (May 7, 2026):** `/multitask` now exposes **Explore-subagent controls** — max depth, concurrency ceiling, and cost ceiling — available in both Agents Window and editor.

### A-02 · Explore Subagent Model Controls

**[official-doc]** · v3.3 (May 7, 2026)

- New settings to control Explore subagent behavior per session:
  - Choose a **specific model** for Explore subagents.
  - **Inherit** the parent agent's model.
  - **Disable** Explore subagents entirely.
- **General model names** are now supported in agent configuration: `model: opus` always resolves to the newest Opus model in that family. Applies in Task tool `model` fields and custom agent definition frontmatter.

### A-06 · v2 Agent Tools — Versioned Successors

**[binary-only]** · v unknown; present at 3.6.21

- Four v2 tool variants are present in the bundle alongside their v1 originals: `read_file_v2`, `list_dir_v2`, `task_v2`, `run_terminal_command_v2`.
- The **reconciled genuine tool count** (tools with both `_params` and `_result` defined) is **~67**. The previously documented figure of 78 is non-reproducible under reconciled counting methodology; a global count reconciliation is deferred to Wave 4. Do not rely on the 78 figure for tooling or tests.

### A-07 · `codebase_search` Removed; `semantic_search` Added

**[binary-only]** (semantic_search presence) · **[official-doc]** (browser surface reduction, v3.0) · version likely 3.0–3.2; confirmed at 3.6.21

- `codebase_search` is **absent** from the 3.6.21 bundle (0 occurrences); it is superseded by **`semantic_search`** and **`semantic_search_full`**.
- `browser_screenshot` is also **removed**; the browser tool surface was tightened per the 3.0 changelog.
- Any hook using `postToolUse` / `preToolUse` that matches tool names by string must be updated: replace `codebase_search` references with `semantic_search`.

### A-10 · `Await` Tool for Agents

**[official-doc]** · v3.0 (Apr 2, 2026) — not present in 3.0.16 docs baseline

- Agents can now **wait** for background shell commands and subagents to complete, or wait for **specific output patterns** (e.g., `"Ready"` or `"Error"`).
- Enables agents to start long-running background processes and resume only once a target state is reached, without manual polling.

---

## Limitations

| Topic | Note |
|-------|------|
| Task parameter schema | **No published JSON Schema** for Task tool arguments; treat parameter tables as **heuristic**. **[research]** |
| Concurrency | **No documented hard limit** in public reference docs; **staff** have described behavior as effectively **“the model decides”** how many subagents to run. **[staff-forum]** |
| Pre-warming / pooling | **No documented** connection **pre-warming** or **pooling** API for subagents. **[research]** |
| MCP context cost | Subagents **inherit MCP tools**; large tool **descriptors and results** can **consume context window** quickly—reported as a practical constraint in **community** discussions. **[community]** |

When implementing automation or rules, **prefer in-product behavior and current Cursor docs** over this file when they disagree.
