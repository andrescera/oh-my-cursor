# Hook Experiments Methodology

_Generated: 2026-04-17_

**See also:**
- [hook-response-fields.md](./hook-response-fields.md) — per-event × per-field status catalog derived from this methodology
- [overloop-design.md](./overloop-design.md) — design decisions that depend on confirmed response fields
- [hooks-v1-vs-v2-claim-diff.md](./hooks-v1-vs-v2-claim-diff.md) — living diff of v1 vs v2 claims

---

## Why we run experiments

Cursor's hook surface (`~/.cursor/hooks.json`) is undocumented. No public schema beyond basic examples exists. The only reliable way to determine which response fields take effect, which are silently ignored, and how the runtime behaves in edge cases is to run controlled experiments against a pinned Cursor version.

**v1 (Oct 2025)** — documented in `docs/internal/hooks-empirical-report.v1.md` (664 lines, Cycles 1+2). Confirmed 20 canonical event names via parser-acceptance testing and source analysis of the workbench bundle. Response-field semantics were mostly inferred from source analysis, not live firing.

**v2 (Apr 2026)** — ran live agent sessions to confirm response-field semantics end-to-end. 459 records captured across 55 experiment IDs. Confirmed `stop.followup_message`, `postToolUse.additional_context`, `beforeShellExecution.permission=deny`, exit-code-2 blocking, and the dual-role (`always-local` / `agent-exec`) environment. See `docs/internal/hooks-v1-vs-v2-claim-diff.md` for the full diff.

---

## Pinning

All v2 experiments were run against:

| Field | Value |
|---|---|
| Cursor version | `3.6.21` |
| Workbench bundle sha256 | `205317ade21ccf6a2b415ef7fa63c1e4c5d394db626f7ada0151a943e1ecc950` |
| Bundle path | `/usr/share/cursor/resources/app/out/vs/workbench/workbench.desktop.main.js` |

The bundle sha256 is the ground truth for the event canonical set. Any new Cursor version must be re-pinned before running new experiments. See `docs/internal/hooks-v2-ghost-hunt.json` for the offline binary-strings sweep that validated the canonical 21-event set (including `workspaceOpen`) against this bundle.

---

## Registry and cells

**`hooks/hooks.experiment.v2.registry.json`** — defines all experiment cells. Each cell has:

| Field | Type | Purpose |
|---|---|---|
| `experiment_id` | `string` | Unique identifier; naming convention below |
| `wave` | `string` | Grouping letter (C, D, EK, H, AB, F, …) |
| `event` | `string` | Canonical hook event name |
| `decision` | `string` | Intent: `logger`, `deny`, `ask`, `additional_context`, etc. |
| `matcher` | `string` | Regex applied to `tool_name`/`command`; empty = match all |
| `sentinel` | `string \| null` | Optional marker string injected into commands for traceability |
| `needs_gate` | `boolean` | Whether a gate cell must have fired before this cell runs |
| `command` | `string` | Shell command invoked by Cursor |
| `responder_args` | `string[]` | Args forwarded to `experiment-logger-v2.sh` |
| `expected_outcome` | `string` | Human-readable success criterion |

Example cell (Wave C, preToolUse logger, unconditional):

```json
{
  "experiment_id": "W-C-preToolUse-logger-001",
  "wave": "C",
  "event": "preToolUse",
  "decision": "logger",
  "matcher": "",
  "sentinel": null,
  "needs_gate": false,
  "command": "bash \"<repo>/hooks/scripts/experiment-logger-v2.sh\" \"preToolUse\" --experiment-id \"W-C-preToolUse-logger-001\"",
  "responder_args": ["preToolUse", "--experiment-id", "W-C-preToolUse-logger-001"],
  "expected_outcome": "Capture preToolUse unconditionally"
}
```

**`hooks/hooks.experiment.v2.json`** — the experiment-set definition generated from the registry. This file is the actual `hooks.json` payload loaded into Cursor during experiments. It is blocked from agent reads during live sessions (deny hook fires on Read of this path) to prevent accidental self-observation. The registry is the source of truth; the experiment set is derived.

---

## Evidence capture

**`docs/internal/hooks-evidence-v2.jsonl`** — append-only. Each line is one hook invocation (JSON object). Key fields:

| Field | Example |
|---|---|
| `experiment_id` | `"W-EK-stop-followup-message-001"` |
| `event` | `"stop"` |
| `payload` | Full JSON payload from Cursor stdin |
| `stdin_preview` | First 500 chars of stdin (for large payloads) |
| `response` | JSON object returned to Cursor on stdout |
| `env_cursor.CURSOR_EXTENSION_HOST_ROLE` | `"always-local"` or `"agent-exec"` |
| `ts` | ISO 8601 timestamp |
| `exit_code` | Exit code of the hook script |

Evidence IDs in the claim diff (e.g. `W-EK-stop-followup-message-001`) are `experiment_id` values that appear as `"experiment_id"` in JSONL lines. To locate a specific record:

```bash
grep '"experiment_id":"W-EK-stop-followup-message-001"' docs/internal/hooks-evidence-v2.jsonl | jq .
```

---

## Reproducibility recipe

> **Before starting:** ensure isolation (see next section). Production daemon must not see experiment events.

1. **Backup production hooks.json:**
   ```bash
   cp ~/.cursor/hooks.json ~/.cursor/hooks.json.bak-$(date +%Y%m%d-%H%M%S)
   ```

2. **Generate experimental hooks.json from registry:**
   The registry at `hooks/hooks.experiment.v2.registry.json` is the source of truth. A generator script to compile it into a valid `hooks.json` does not yet exist — **TODO: write `hooks/scripts/generate-experiment-config.ts`**. Until then, `hooks/hooks.experiment.v2.json` is the pre-generated output and can be copied directly.

3. **Install the experiment config:**

   > **Note:** `hooks/hooks.experiment.v2.json` uses `<REPO>` as a placeholder for the
   > repository root. Substitute it with the actual path before copying:
   > ```bash
   > sed -i "s|<REPO>|$(pwd)|g" hooks/hooks.experiment.v2.json
   > ```

   ```bash
   cp hooks/hooks.experiment.v2.json ~/.cursor/hooks.json
   # Or for isolated-HOME runs, copy to $EXP_HOME/.cursor/hooks.json
   ```

4. **Reload Cursor (or restart the agent session):**
   Hook config is read on agent session start. A full Cursor restart is safest. A fresh agent session (close and reopen the composer) also works for user-hook-path changes.

5. **Trigger relevant agent flows:**
   Drive the session to fire the target events. Useful triggers:
   - `preToolUse` / `postToolUse`: any tool call (Read, Write, Shell, Task)
   - `beforeShellExecution`: Shell tool with any command
   - `stop`: let the agent reach a natural end-of-turn
   - `subagentStart` / `subagentStop`: `Task(subagent_type=...)` call
   - `postToolUseFailure`: hook that returns `permission:deny` or exit code 2

6. **Append captured records to JSONL:**
   The experiment logger script (`hooks/scripts/experiment-logger-v2.sh`) writes to `docs/internal/hooks-evidence-v2.jsonl`. Confirm new records appeared:
   ```bash
   tail -5 docs/internal/hooks-evidence-v2.jsonl | jq .experiment_id
   ```

7. **Restore production hooks.json:**
   ```bash
   cp ~/.cursor/hooks.json.bak-<timestamp> ~/.cursor/hooks.json
   ```

---

## Isolation strategy

Running experiment hooks alongside a live production daemon risks injecting experiment events into production state.

### Recommended: isolated HOME

Launch a separate Cursor instance with an alternate `HOME`:

```bash
EXP_HOME="/tmp/oh-my-cursor-exp-$(uuidgen)"
mkdir -p "$EXP_HOME/.cursor"
cp hooks/hooks.experiment.v2.json "$EXP_HOME/.cursor/hooks.json"
HOME="$EXP_HOME" cursor --new-window /tmp/experiment-workspace &
```

The alternate instance uses an empty workspace history and writes its daemon state to `$EXP_HOME` paths, never touching `/tmp/oh-my-cursor-state/` (production daemon socket directory).

### Alternative: in-place edit (higher risk)

Edit `~/.cursor/hooks.json` in-place after backup. **Only safe when no production agent session is running.** Risk: if a production session is running and the hook daemon reads the new config mid-session, experiment responses (deny, followup_message, etc.) will affect live work.

### Validation gate

Before running any experiment cell, assert:

```bash
# Option A: HOME differs from production user HOME
[ "$HOME" != "/home/$USER" ] && echo "ISOLATED"

# Option B: production daemon not running
! pgrep -f 'hooks/daemon.ts' > /dev/null && echo "NO DAEMON"
```

Proceed only when at least one gate passes.

---

## How to add a new cell

**Naming convention:** `W-<wave>-<event>-<purpose>-NNN`

- `<wave>`: single uppercase letter or abbreviation (C = core loggers, D = deny/failClosed, EK = stop+followup, H = additional_context, AB = all-events-baseline, F = prompt-type)
- `<event>`: exact canonical event name (camelCase)
- `<purpose>`: hyphenated description (logger, deny, additional-context, ask, exit-2, etc.)
- `NNN`: zero-padded 3-digit sequence within the wave+event group

**JSON shape to add to `hooks/hooks.experiment.v2.registry.json`:**

```json
{
  "experiment_id": "W-X-eventName-purpose-001",
  "wave": "X",
  "event": "eventName",
  "decision": "logger",
  "matcher": "",
  "sentinel": "CURSOR_HOOK_V2_X_001",
  "needs_gate": false,
  "command": "bash \"<repo>/hooks/scripts/experiment-logger-v2.sh\" \"eventName\" --experiment-id \"W-X-eventName-purpose-001\"",
  "responder_args": ["eventName", "--experiment-id", "W-X-eventName-purpose-001"],
  "expected_outcome": "Describe what constitutes success"
}
```

After adding cells, regenerate `hooks/hooks.experiment.v2.json` from the registry (TODO: generator script), run the experiment, and append evidence to the JSONL.

---

## Updating the claim diff

After new evidence is captured:

1. Open `docs/internal/hooks-v1-vs-v2-claim-diff.md`.
2. Find the relevant row in **Part A** (v1-derived) or add a row to **Part B** (new in v2).
3. Set `v2 status` to one of: `confirmed`, `refuted`, `superseded`, `still-unknown`, `n/a-descope`.
4. Set `v2 evidence` to the new `experiment_id`(s), e.g. `W-X-eventName-purpose-001`.
5. Update the summary table counts at the bottom of the diff file.

The `[hook-response-fields.md](./hook-response-fields.md)` catalog must also be updated: set the `Status` column for the affected event × field row.
