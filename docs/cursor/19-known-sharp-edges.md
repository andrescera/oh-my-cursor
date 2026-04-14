# Known Sharp Edges

> Operational gotchas and version-dependent behavior. Cursor **3.0.16**.

Items are tagged by evidence type. **[community]** and **[binary-only]** entries are **not** stable product guarantees.

---

## Hooks

- **`beforeShellExecution`:** **Malformed JSON** fed into the hook has been reported to **fail open** (allow path) — do not assume fail-closed behavior on parse errors. [community]
- **`afterAgentThought`:** **Model / type** fields in payloads have been **unclear** or inconsistent across reports; validate on your build if you depend on this step. [staff-forum]
- **Windows:** **UTF-8** encoding issues with hook **stdio** have been reported; test cross-platform scripts explicitly. [community]
- **Detection:** Hooks may **not** be recognized **immediately** after **creating** the config file; editor reload or a short delay may be needed. [community]
- **Multi-root:** Hooks from **all** workspace roots load in **3.0**-era behavior (earlier versions were inconsistent). [changelog]

---

## MCP

- **Tool discovery:** The agent sometimes does **not** surface all **MCP tools** immediately after connect; retry or wait may be needed. [staff-forum]
- **Subagent inheritance:** Subagents **inherit** parent MCP tools; **large descriptors and results** can **consume context** quickly. [community]

---

## Rules

- Rules do **not** apply to **Cursor Tab** (autocomplete). [official-doc]
- **User** rules do **not** apply to **Inline Edit** (Cmd/Ctrl+K). [official-doc]

---

## Subagents

- **Concurrency:** There is **no published hard limit** on parallel subagents; **staff** have described behavior as **“the model decides”** how many to spawn. [staff-forum]
- **Dispatch limits:** **Per-turn** dispatch limits are **enforced by this project’s hooks** (not a Cursor platform cap). [repro-local]
- **BYOK:** **Bring-your-own-key** setups may hit **lower rate limits** than Cursor-hosted routing. [staff-forum]

---

## Modes

- **Context reset:** Switching modes effectively starts **fresh** context for the new mode’s workflow; long threads may not carry over as expected. [official-doc]
- **Debug:** **Debug mode** is only reliably entered via the **UI** (picker / keyboard cycle); CLI / ACP / SwitchMode gaps apply. [official-doc]

---

## Plans

- **Default path:** New plan files default under the **home** plans directory (`~/.cursor/plans/`); **Save to workspace** (e.g. `.cursor/plans/`) is optional. [official-doc]

---

## See also

- [Hooks](03-hooks.md) — configuration and event list.
- [Modes & Switching](01-modes-and-switching.md) — programmatic vs UI mode entry.
- [Plan System](08-plan-system.md) — paths and UI.
- [Agent System](02-agent-system.md) — Task tool and inheritance.
