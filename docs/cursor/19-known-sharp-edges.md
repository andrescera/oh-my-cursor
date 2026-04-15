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

### Hook Tool Coverage

`preToolUse` and `postToolUse` are **not** the same coverage: tools matched by `hooks.json` can still receive `preToolUse` even when Cursor never emits `postToolUse` for them. Verified from a 4.5MB production conversation log (9,452 `postToolUse` events, Cursor 3.0.16): [repro-local]

**Tools that DO fire `postToolUse`:** `Read` (4,565), `Grep` (2,709), `Shell` (1,212), `Write` (834), `WebSearch` (84), `WebFetch` (41), `Delete` (7).

**Tools that do NOT fire `postToolUse`:** `TodoWrite`, `SwitchMode`, `AskQuestion`, `CreatePlan`, `Task`, `Glob`, `StrReplace`, `EditNotebook`, `GenerateImage`. Zero `postToolUse` events observed for any of these across 316 `/stop` events and the full conversation log. [repro-local] Several of these (e.g. `Task`, `Glob`, and other tools your `hooks.json` matchers include) **do** fire `preToolUse` when the matcher applies. **`SwitchMode` fires neither** `preToolUse` nor `postToolUse` — verified, not merely observed: **zero** `tool=SwitchMode` events in daemon logs across 10+ conversations despite `SwitchMode` `tool_use` calls in transcripts. [repro-local]

**Implication for hook developers:** Do not rely on `postToolUse` to track `TodoWrite` calls, `SwitchMode` mode changes, or `Task` dispatches. Do not expect `SwitchMode` on any hook stage. Use `preToolUse` where configured (e.g. for `Task` / `Glob`), plus alternatives such as `afterAgentResponse` parsing, `beforeSubmitPrompt` context injection, or `subagentStart`/`subagentStop` for Task tracking.

### Cursor Command Expansion

Cursor slash commands defined in `commands/*.md` are **expanded by Cursor before reaching `beforeSubmitPrompt`**. The hook receives the user's additional text (after the command prefix), not the literal `/plan`, `/start-work`, etc. For example, when the user types `/plan find bugs`, the `beforeSubmitPrompt` hook receives `"find bugs"` as the prompt — not `"/plan find bugs"`. [repro-local]

### Composer Mode Not in Hook Payloads

`composer_mode` (snake_case) **is** present on **`beforeSubmitPrompt`** payloads for Cursor **3.0.16+**, indicating the active mode (plan/agent/debug/ask). [repro-local] **`preToolUse` payloads still do not** include `composer_mode`, `composerMode`, or `mode` — mode cannot be read consistently from every hook stage.

**Workaround:** Mode is taken from `composer_mode` when present, with `detectPlanMode()` heuristics as a fallback. When `/start-work` is processed, `conversation.composerMode` is explicitly set to `"agent"` and plan-phase todo IDs are cleared from `todoStates` to break stickiness. When **all plan-phase todos** are done, the Task guard **auto-transitions** composer mode to agent via the shared **`transitionFromPlanMode()`** helper — the **same** helper **`/start-work`** uses. **`detectPlanMode`** hardening: the two heuristic fallback branches (**plan-phase todos**, ca. L86–91, and **contextHistory**, ca. L93–96) are gated behind **`!conversation.composerMode`**, so they only run for **fresh** conversations where mode was never explicitly set. The **only** remaining intentional sticky path is **`composerMode === "plan"`** (ca. L76), which is **correct** when `composerMode` is accurately set. The `preToolUse` handler also checks `input.mode` and `input.composerMode` as a forward-compatibility measure, but these fields are currently always undefined.

### Conversation Isolation Gaps

Critical state (`ConversationState`, `BackgroundTracker`, `contextCollector`, `WisdomTracker`) is isolated per `conversationId`. Fixed in recent hardening pass:
- **`WisdomTracker`**: Now keyed by `{conversationId}:{planPath}` composite key (previously plan-path-only, allowing cross-conversation wisdom leakage)
- **`BackgroundTracker` HTTP handler**: Returns empty array when `conversationId` is missing (previously returned all conversations' tasks)
- **`/start-work` plan loading**: Only reads per-conversation state file `active-plan-{conversationId}.json` (previously fell back to global `active-plan.json` and mtime-based plan scan)
- **Draft files**: Now use `{sessionId-short}-{name}.md` naming convention (previously topic-slug-only, causing collisions between parallel conversations)

Known remaining shared state:
- **`/tmp/oh-my-cursor-timing.jsonl`**: Global file for subagent timing telemetry, shared across all conversations (deferred fix)
- **Event logs**: Written per conversation (`session-log-{sessionId}.jsonl`) but the in-memory buffer remains global for cross-conversation admin queries via `getEvents()`
- **Config**: `loadConfig()` returns project-level config, intentionally shared
- **Console output**: Process-level stdout/stderr, not actionable data

Known Cursor IDE-level limitations (not fixable by hooks):
- **Recently viewed files**: Cursor's system context includes files from all conversations in the same workspace. Draft files from other conversations may appear in another conversation's `recently_viewed_files`.
- **Command expansion**: The `cursor_commands` section content is controlled by Cursor IDE internals, not by the hook daemon.

### Dispatch Counter Semantics

- **`dispatchCounts`**: Cumulative per-conversation counter. Incremented on every `preToolUse`, never resets within a conversation. Used for skill reminders and dashboard display.
- **`dispatchCountsThisTurn`**: Per-turn counter. Resets to `{}` on each `beforeSubmitPrompt`. Tracks dispatches within a single user message turn.
- **Concurrent limits**: Enforced via `BackgroundTracker.getActiveTasksForConversation()` live counts, NOT via either dispatch counter. The tracker uses an in-memory Map with 10-minute stale cleanup.

### Tiled Layout Implications (Cursor 3)

Cursor 3's tiled layout enables multiple concurrent agent conversations per workspace. All critical hook state is isolated by `conversationId`, so parallel chat windows do not interfere. The `BackgroundTracker` correctly scopes active task counts per conversation. Conversation log files are written per conversation. The daemon process is shared but stateless beyond the tracker and conversation `Map`.

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
- **Non-deterministic placement:** `CreatePlan` sometimes writes to `~/.cursor/plans/` (user-level) and sometimes to `.cursor/plans/` (workspace-level). Workflows that expect plans at a fixed workspace-relative path cannot rely on `CreatePlan`. [repro-local]
- **No hook events:** `CreatePlan` does not fire `preToolUse` or `postToolUse` hooks (see Hook Tool Coverage above). This means the hook system cannot detect when a plan is created, track it, or trigger continuation logic afterward. After `CreatePlan` executes, `/stop` fires with no information about what just happened — the continuation handler cannot distinguish "agent just created a plan" from "agent finished talking." [repro-local]
- **Workaround:** Use `Write` to create plan files directly at `.cursor/plans/<name>.plan.md`. `Write` fires `postToolUse`, giving the hook system visibility into plan creation. The plan format is YAML frontmatter (`name`, `overview`, `todos`, `isProject`) followed by a markdown body. [repro-local]

---

## See also

- [Hooks](03-hooks.md) — configuration and event list.
- [Modes & Switching](01-modes-and-switching.md) — programmatic vs UI mode entry.
- [Plan System](08-plan-system.md) — paths and UI.
- [Agent System](02-agent-system.md) — Task tool and inheritance.
