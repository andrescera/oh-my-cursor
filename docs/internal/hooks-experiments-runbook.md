# Hook Experiments Runbook — Wave X

_Created: 2026-04-17_

**See also:**
- [experiments-methodology.md](./experiments-methodology.md) — experiment framework, pinning, and validation gate definitions
- [hooks-v1-vs-v2-claim-diff.md](./hooks-v1-vs-v2-claim-diff.md) — living diff of v1 vs v2 claims (Part B rows added post-run)
- [hooks-evidence-v2.jsonl](./hooks-evidence-v2.jsonl) — evidence archive (append results here after each run)
- Registry: `hooks/hooks.experiment.v2.registry.json` — cells `W-X-*` added by T8

This runbook is the actionable "how to run" companion for E1, E3, E5, and E6 (plus demoted E2).
The methodology framework lives in [experiments-methodology.md](./experiments-methodology.md).

---

## Wave X Experiment Inventory

| ID | Experiment | Event(s) | Priority | Gates |
|---|---|---|---|---|
| E1 | `afterAgentResponse` reliability (5 firings) | `afterAgentResponse` | **GATE** | W3b-T10 (`afterAgentResponse` production hook) |
| E2 | `subagentStop` followup-message resume | `subagentStop` | DEMOTED | none |
| E3 | `stop` followup-merge order (2 entries) | `stop` | High | overloop merge semantics |
| E5 | `subagentStop` transcript-path format | `subagentStop` | High | transcript-reading in production hooks |
| E6 | `session_id` cross-role equality | `subagentStart`, `subagentStop` | High | N11 confirmation |
| B1 | `preToolUse(Task).updated_input` replace-vs-merge (model-only) | `preToolUse`, `subagentStart` | **GATE** | Task 7 central composer (echo-all decision) |
| B2 | `preToolUse(Task).updated_input` prompt + `subagent_type` survival | `preToolUse`, `subagentStart` | High | piggyback channel for dynamic prompts |
| B3 | `preToolUse(Task).updated_input` prompt size bound (1KB/8KB/64KB) | `preToolUse`, `subagentStart` | High | `max_piggyback_chars` default budget |

---

## Pre-flight

> Re-pinned to 3.6.21 on 2026-05-29.

Before running any Wave X experiment, verify ALL of the following:

```bash
# 1. Confirm Cursor version
cursor --version
# Expected: 3.6.21  (see experiments-methodology.md §Pinning for the sha256)

# 2. Confirm workbench bundle sha256
sha256sum /usr/share/cursor/resources/app/out/vs/workbench/workbench.desktop.main.js
# Expected: 205317ade21ccf6a2b415ef7fa63c1e4c5d394db626f7ada0151a943e1ecc950

# 3. Confirm bun is on PATH (required by experiment-logger-v2.sh and transcript-probe.sh)
bun --version

# 4. Confirm the evidence dir is writable
mkdir -p /tmp/cursor-hooks-evidence && ls -la /tmp/cursor-hooks-evidence/

# 5. Check whether a production daemon is running
ps aux | grep 'cursor-hook\|hooks/daemon' | grep -v grep
# If a daemon is running, either stop it or use the isolated HOME approach (§Isolation Harness)
```

If any check fails, **do not proceed**. See [experiments-methodology.md](./experiments-methodology.md) for the validation gate requirements.

---

## Isolation Harness

> **WARNING**: The experiments below require loading a custom `hooks.json`. This section describes how to launch an isolated Cursor instance that reads a temporary config without touching `~/.cursor/hooks.json`.

The approach assumes `cursor` CLI honors `HOME` for config discovery — this assumption should be validated first per the validation gate in [experiments-methodology.md](./experiments-methodology.md) §Environment.

```bash
# Step 1: Create an isolated HOME
EXP_HOME="/tmp/oh-my-cursor-exp-$(date +%s)"
mkdir -p "$EXP_HOME/.cursor"

# Step 2: Back up the real hooks.json (safety net)
cp ~/.cursor/hooks.json "$EXP_HOME/.cursor/hooks.json.backup"

# Step 3: Write the experimental hooks.json into the isolated HOME
# (replace CELLS_JSON with the merged hooks config for the experiment cells you want to run)
# Example for E1 only:
cat > "$EXP_HOME/.cursor/hooks.json" << 'HOOKS_EOF'
{
  "hooks": [
    {
      "event": "afterAgentResponse",
      "command": "bash \"<repo>/hooks/scripts/experiment-logger-v2.sh\" \"afterAgentResponse\" --experiment-id \"W-X-afterAgentResponse-reliability-001\""
    }
  ]
}
HOOKS_EOF

# Step 4: Launch isolated Cursor instance
HOME="$EXP_HOME" cursor <repo> &
CURSOR_PID=$!
echo "Isolated Cursor PID: $CURSOR_PID"
echo "Isolated HOME: $EXP_HOME"

# Step 5: After running experiments, restore (and kill isolated instance)
# kill $CURSOR_PID
# The original ~/.cursor/hooks.json is untouched — no restore needed
```

> **Note on HOME isolation**: If `cursor` does not honor the `HOME` override for hooks.json discovery, you will need to directly swap `~/.cursor/hooks.json` for the experiment duration and restore it immediately after. In that case, the backup at step 2 is critical. See [experiments-methodology.md](./experiments-methodology.md) for the HOME-override validation test.

### Generating the experimental hooks.json from registry cells

```bash
# Extract W-X cells from the registry and format as a hooks.json
cd <repo>
bun -e "
  const reg = JSON.parse(require('fs').readFileSync('hooks/hooks.experiment.v2.registry.json', 'utf8'));
  const wxCells = reg.cells.filter(c => c.wave === 'X');
  const hooks = wxCells.map(c => ({ event: c.event, command: c.command }));
  console.log(JSON.stringify({ hooks }, null, 2));
"
```

---

## Step-by-Step Run Guide

### E1 — `afterAgentResponse` Reliability (5 firings)

**Goal**: Confirm `afterAgentResponse` fires at least 5 times in a single agent session and record the payload field names (e.g., `Object.keys(stdin_payload)`) plus the first 500 chars of any `response`/`text`/`content` field.

**Setup**: Load a `hooks.json` containing all 5 `W-X-afterAgentResponse-reliability-00N` cells into the isolated HOME.

**Agent turns** (5 trivial turns, each produces one `afterAgentResponse` firing):

1. `Read <repo>/package.json`
2. `What is the project name?` (any short question)
3. `Read <repo>/hooks/hook-config.ts` (first 20 lines)
4. `How many files are in the hooks/ directory?`
5. `Read <repo>/README.md` (first 10 lines)

**Evidence capture**:
```bash
# After the 5 turns, check for evidence records
ls -la /tmp/cursor-hooks-evidence/*.json | tail -20

# Inspect what field names appeared in the afterAgentResponse payload
jq -r 'keys[]' /tmp/cursor-hooks-evidence/content-*.json | sort -u

# Find first 500 chars of the response/text/content field
jq -r '.response // .text // .content // "FIELD-NOT-FOUND" | .[0:500]' /tmp/cursor-hooks-evidence/content-*.json
```

**Acceptance**: `rg -c '"experiment_id":"W-X-afterAgentResponse-reliability-001"' /tmp/cursor-hooks-evidence/*.json` ≥ 1 (one record per cell per firing — up to 5 total across all 5 cells).

**If < 5 firings captured**: `afterAgentResponse` may not fire on every turn, or fires only once per session. Flag for W3b-T10 re-design — the production hook assumption that it fires reliably on every response is not confirmed.

---

### E2 — `subagentStop` Followup-Message Resume (DEMOTED)

**Goal**: Observe whether a `followup_message` returned from a `subagentStop` hook causes the parent agent to resume with that message. This is a nice-to-have probe — **does not gate any task**.

**Setup**: Load `W-X-subagentStop-followup-message-001` cell.

**Agent turn**: Dispatch any `Task(subagent_type="explore", ...)` call and wait for it to complete.

**Expected signal**: If `followup_message` is honored for `subagentStop`, the agent will receive `"ULW-PROBE-FOLLOWUP-CURSOR_HOOK_V2_X_SUBSTOP_001"` as a continuation message after the subagent finishes.

**Note**: Given W-EK findings that `subagentStop` followup_message behavior is inconsistent, treat a null result as expected and move on.

---

### E3 — `stop` Followup-Merge Order (2 entries)

**Goal**: When multiple `stop` hook entries each return a distinct `followup_message`, observe the merge strategy (concatenate / first-wins / last-wins / error).

**Setup**: Load BOTH `W-X-stop-followup-merge-001` and `W-X-stop-followup-merge-002` cells simultaneously.

**Agent turn**: End the session normally (close the Cursor conversation tab or type `/done`). Both `stop` hooks will fire.

**Evidence capture**:
```bash
# Look for the followup_message that the agent received in the next session
# The merged or selected message should appear in the next turn's context
rg 'STOP-MERGE-PROBE' /tmp/cursor-hooks-evidence/*.json
```

**Interpret results**:

| Outcome | Interpretation |
|---|---|
| Both strings appear (concatenated) | Cursor merges multiple `followup_message` values with a separator |
| Only `STOP_001` appears | First-wins strategy |
| Only `STOP_002` appears | Last-wins strategy |
| Neither appears / session ends cleanly | `stop` followup_message is silently dropped when duplicated |
| Error / hang | Conflict is fatal; single-entry only |

**Claim diff row to add**: Part B N-new: "`stop` followup_message merge strategy when multiple entries present: `<observed>`"

---

### E5 — `subagentStop` Transcript Path Format

**Goal**: Confirm the format of the file referenced by `agent_transcript_path` in the `subagentStop` payload (JSON Lines / plain text / binary), unblocking decisions about reading transcripts in production hooks.

**Setup**: Load `W-X-subagentStop-transcript-path-001` cell. This uses `transcript-probe.sh` which automatically runs `head -c 200` and `file -b` on the referenced path.

**Agent turn**: Dispatch any `Task` subagent call — for example:
```
Task(subagent_type="explore", description="30-second probe", prompt="List the top-level files in <repo>")
```
Wait for the Task to complete (30–60 seconds). The `subagentStop` hook fires automatically when the subagent finishes.

**Evidence capture**:
```bash
# Find the transcript-probe evidence records
ls -la /tmp/cursor-hooks-evidence/transcript-probe-*.json

# Inspect the format finding
jq '{path: .agent_transcript_path, format: .transcript_format, size: .transcript_size_bytes}' \
  /tmp/cursor-hooks-evidence/transcript-probe-*.json

# Decode and inspect the first 200 bytes
jq -r '.transcript_head_b64' /tmp/cursor-hooks-evidence/transcript-probe-*.json | base64 -d | head -c 200
```

**Interpret results**:

| `transcript_format` output | Interpretation |
|---|---|
| `ASCII text` | Plain text — safe to read line-by-line |
| `JSON data` | Single JSON document |
| `ASCII text, with very long lines` | JSON Lines (one JSON object per line) |
| `data` or `binary` | Binary format — do not read as text |
| `not-found` / empty path | `agent_transcript_path` field absent from payload; feature not available |

**If `agent_transcript_path` is absent**: Flag this — the E5 assumption that `subagentStop` includes a transcript path is unconfirmed. Check the `stdin_preview` in the standard logger evidence to see all available fields.

---

### E6 — `session_id` Cross-Role Equality

**Goal**: Confirm that `session_id` is equal across the `agent-exec` role (fires in `subagentStart`) and the `always-local` role (fires in `subagentStop`), as predicted by N11.

**Setup**: Load BOTH `W-X-session-id-cross-role-001` (subagentStart) and `W-X-session-id-cross-role-002` (subagentStop) cells.

**Agent turn**: Dispatch any `Task` subagent call and wait for completion. Both hooks fire automatically.

**Evidence capture**:
```bash
# Extract session_id from both firings
jq -r '{experiment_id: .experiment_id, session_id: .session_id, role: .env_cursor.CURSOR_EXTENSION_HOST_ROLE}' \
  /tmp/cursor-hooks-evidence/*.json | grep -A3 'W-X-session-id-cross-role'

# Quick equality check
START_SID=$(jq -r 'select(.experiment_id == "W-X-session-id-cross-role-001") | .session_id' /tmp/cursor-hooks-evidence/*.json | head -1)
STOP_SID=$(jq -r 'select(.experiment_id == "W-X-session-id-cross-role-002") | .session_id' /tmp/cursor-hooks-evidence/*.json | head -1)
[ "$START_SID" = "$STOP_SID" ] && echo "PASS: session_id equal across roles" || echo "FAIL: session_id mismatch — $START_SID vs $STOP_SID"
```

**Also check `agent_id` and `conversation_id`** for cross-role consistency.

---

## B — `preToolUse(Task).updated_input` Merge Semantics (B-probe)

> **Plan**: `dynamic-models-and-37-upgrades` Task 1. **Gates** Task 7 (central composer): the replace-vs-merge verdict decides whether the composer must echo every original `tool_input` field in its `updated_input` response.
>
> **Target version**: the binary pinned at run time (plan pins the **3.7.x** line; record the actual `cursor_version` from the payload envelope). **Status as committed: DESIGN-PHASE** — scripts + procedure authored and dry-run validated against a synthetic Task payload; live-fire capture pending (this environment cannot fire Cursor's Task tool). Forum thread **151985** (Cursor staff, 2026-04-07) confirms `preToolUse(Task).updated_input` **takes effect** on the 3.7.x line; this B-probe is the empirical procedure to convert that claim to captured evidence.

### Four questions this probe answers

1. **Replace vs merge** — when the hook returns `updated_input: { model: "<alt>" }` ONLY, does Cursor REPLACE the entire `tool_input` (dropping `prompt`/`subagent_type`/`description`) or shallow-MERGE the partial object over the original?
2. **Prompt survival** — when the hook returns `updated_input: { prompt: "<SENTINEL>\n\n<orig>" }` ONLY, does the subagent receive the modified prompt?
3. **`subagent_type` survival** — does the original `subagent_type` survive a partial `updated_input` that omits it (i.e. does the `explore` subagent still launch)?
4. **Size bound** — at what piggyback size (1KB / 8KB / 64KB) does Cursor stop accepting (or start truncating) the `updated_input`?

### Probe scripts (under `hooks/experiments/responders/`)

| Script | Role |
|---|---|
| `task-updated-input-probe.sh <EXP_ID> preToolUse <MODE> [ALT_SLUG]` | Emits a partial `updated_input` for `MODE ∈ {model-only, prompt-piggyback, echo-all}`; writes a `b-series-correlation-<uuid>.json` record. |
| `task-piggyback-size-probe.sh <EXP_ID> preToolUse <SIZE_BYTES>` | Emits a `prompt` piggyback of `SIZE_BYTES` framed with HEAD/TAIL markers; writes a `b-series-size-<uuid>.json` record. |

Both source `responders/_common.sh` (logs the inbound payload via `experiment-logger-v2`, then the responder owns stdout). Correlation records carry `sentinel`, `tool_use_id`, `conversation_id`, and `original.tool_input_keys` so a later `subagentStart` firing (whose `task` and `subagent_model` fields are populated since 3.5.38) can be matched and classified.

### Cells

| Cell ID | MODE / size | Matcher | `updated_input` emitted |
|---|---|---|---|
| `W-X-preToolUse-task-updated-input-merge-001` | `model-only` | `^Task$` | `{"model":"composer-2-fast"}` |
| `W-X-preToolUse-task-updated-input-merge-002` | `prompt-piggyback` | `^Task$` | `{"prompt":"SENTINEL_OMC_PIGGYBACK_<nonce>\n\n<orig>"}` |
| `W-X-preToolUse-task-updated-input-size-003` | `1024` → `8192` → `65536` | `^Task$` | `{"prompt":"<HEAD>…pad…<TAIL>\n\n<orig>"}` (one firing per size) |
| `W-X-preToolUse-task-updated-input-echoall-ref` | `echo-all` (replace-safe reference) | `^Task$` | `{...orig tool_input, model, prompt}` |

> **Matcher note**: `preToolUse` matches on `tool_name` (case-sensitive `new RegExp`). Use `^Task$` to scope strictly to the Task tool. Do **not** match-all here — an unscoped `updated_input` would rewrite the input of every tool call.

### Setup (Isolation Harness, B variant)

Use a project-level `.cursor/hooks.json` (discovery order `…/<workspace>/.cursor/hooks.json`, last in precedence) rather than touching `~/.cursor/hooks.json`. Run one variant at a time.

```bash
cd <repo>
# B1 — replace-vs-merge (model-only), scoped to Task
cat > .cursor/hooks.json << 'HOOKS_EOF'
{
  "version": 1,
  "hooks": {
    "preToolUse": [
      {
        "matcher": "^Task$",
        "command": "bash \"<repo>/hooks/experiments/responders/task-updated-input-probe.sh\" \"W-X-preToolUse-task-updated-input-merge-001\" \"preToolUse\" \"model-only\" \"composer-2-fast\""
      }
    ],
    "subagentStart": [
      { "command": "bash \"<repo>/hooks/scripts/experiment-logger-v2.sh\" \"subagentStart\" --experiment-id \"W-X-preToolUse-task-updated-input-merge-001\"" }
    ]
  }
}
HOOKS_EOF
```

For **B2** swap the `preToolUse` command to MODE `prompt-piggyback` (drop the `ALT_SLUG` arg) and experiment id `…merge-002`. For **B3** point `preToolUse.command` at `task-piggyback-size-probe.sh … <SIZE_BYTES>` and run it three times (1024, 8192, 65536), one size per run, keeping the `subagentStart` logger loaded each time.

> **Restore**: `rm <repo>/.cursor/hooks.json` after each run.

### Agent turns

Dispatch a trivial Task whose original prompt is uniquely greppable, e.g.:
```
Task(subagent_type="explore", description="B-probe", prompt="OMC_ORIG_PROMPT_MARKER list top-level files")
```
The `preToolUse(Task)` hook fires before the subagent launches; `subagentStart` fires as it launches with the (possibly rewritten) `task` and `subagent_model`.

### Evidence capture

```bash
ED="${CURSOR_HOOKS_EVIDENCE_DIR:-/tmp/cursor-hooks-evidence}"

# What the hook EMITTED (correlation side)
jq '{exp:.experiment_id, mode, sentinel, emitted:.emitted_updated_input_keys, orig_keys:.original.tool_input_keys}' \
  "$ED"/b-series-correlation-*.json

# What the subagent RECEIVED (subagentStart logger side) — decode stdin_preview
for f in "$ED"/*.json; do
  jq -e 'select(.experiment_id|startswith("W-X-preToolUse-task-updated-input"))' "$f" >/dev/null 2>&1 \
    && jq -r '.stdin_preview' "$f"
done | grep -o 'SENTINEL_OMC_[A-Z_0-9]*\|OMC_ORIG_PROMPT_MARKER\|"subagent_model":"[^"]*"\|"subagent_type":"[^"]*"'
```

### Interpret results

**B1 — replace vs merge** (variant A, model-only):

| `subagentStart` observation | Verdict |
|---|---|
| `task` still contains `OMC_ORIG_PROMPT_MARKER` AND `subagent_type=="explore"` AND `subagent_model=="composer-2-fast"` | **MERGE (shallow)** — partial `updated_input` overlays original; model override applied, other fields preserved |
| `task` empty/default OR `subagent_type` dropped OR subagent fails to launch | **REPLACE** — `updated_input` replaces whole `tool_input`; Task 7 MUST echo every original field |
| `subagent_model` still `claude-opus-4-7-thinking-xhigh` (unchanged) | `updated_input` **ACCEPTED-BUT-IGNORED** for `model` — re-test via `model` rewrite on a path with a distinct slug |

**B2 — prompt + `subagent_type` survival** (variant B, prompt-piggyback):

| Observation | Verdict |
|---|---|
| `task` starts with `SENTINEL_OMC_PIGGYBACK_<nonce>` AND `subagent_type=="explore"` | Prompt rewrite **TAKES-EFFECT**; `subagent_type` **survives** partial override → MERGE confirmed |
| `task` carries sentinel but subagent launches as wrong/default type | Prompt merged but `subagent_type` dropped → partial-replace; echo `subagent_type` defensively |
| `task` lacks sentinel (original prompt unchanged) | Prompt override **IGNORED** for Task event |

**B3 — size bound** (variant C):

| HEAD / TAIL markers in `subagentStart.task` | Verdict |
|---|---|
| HEAD present + TAIL present at size N | Accepted whole at N bytes |
| HEAD present + TAIL absent | Truncated between HEAD and TAIL → bound is below N; bisect downward |
| HEAD absent + TAIL absent | Override rejected/replaced at N → bound is below N |

Set `max_piggyback_chars` to `min(8000, probed_bound × 0.8)` (decisions notepad). 3.5.38 corpus observed `subagentStart.task` lengths up to **15,308 chars**, so 1KB and 8KB are expected ACCEPTED; 64KB is the open question.

### Acceptance

```bash
ED="${CURSOR_HOOKS_EVIDENCE_DIR:-/tmp/cursor-hooks-evidence}"
# at least one correlation record per cell
ls "$ED"/b-series-correlation-*.json >/dev/null 2>&1 && echo "B1/B2 correlation present"
ls "$ED"/b-series-size-*.json        >/dev/null 2>&1 && echo "B3 size records present"
# at least one subagentStart capture for the probe experiment ids
rg -l '"experiment_id": *"W-X-preToolUse-task-updated-input' "$ED" | head
```

### Failure interpretation guide (B)

| Cell | Failure mode | Interpretation | Action |
|---|---|---|---|
| B1 | No `subagentStart` record captured | `preToolUse(Task)` may not fire, or matcher `^Task$` wrong | Re-check `tool_name` value in the `preToolUse` correlation record; confirm Task hooks fire at the pinned version |
| B1 | `subagent_model` unchanged | `updated_input.model` ignored for Task | Mark `model` ACCEPTED-BUT-IGNORED; route model via config, not `updated_input` |
| B2 | Sentinel absent from `task` | Prompt override dropped | Do not rely on the piggyback channel; revisit Task 7 design |
| B3 | All sizes rejected | `updated_input.prompt` not honored for Task at this version | Escalate; the dynamic-prompt feature is blocked |

### Last run

- **Date**: 2026-06-12
- **Status**: **DESIGN-PHASE** — scripts authored, `bash -n` clean, dry-run against synthetic Task payload produced valid `updated_input` JSON for all variants and well-formed correlation records (see `.omo/evidence/task-1-merge-semantics.log`, `.omo/evidence/task-1-size-limit.log`).
- **Expected verdicts (pending live-fire, from forum 151985 + 3.5.38 corpus)**: B1 → **MERGE (shallow)** most likely; Task 7 nonetheless echoes all fields (replace-safe). B2 → prompt + `subagent_type` **survive**. B3 → ≥16KB accepted (15,308 observed), 64KB UNCONFIRMED; default `max_piggyback_chars=8000`.
- **Do not** mark `preToolUse.updated_input` `TAKES-EFFECT` in `hook-response-fields.md` until a live-fire `subagentStart` capture confirms a verdict.

---

## Evidence Capture (Post-Run)

After completing any experiment run, copy the new evidence records into the shared archive:

```bash
# 1. Identify new records (created after the experiment started)
EXPERIMENT_START="2026-04-17T00:00:00Z"  # adjust to actual start time
find /tmp/cursor-hooks-evidence -name '*.json' -newer /tmp/cursor-hooks-evidence/_header.json -type f

# 2. Convert to JSONL and append to the evidence archive
# NOTE: Do NOT overwrite — always APPEND
for f in $(find /tmp/cursor-hooks-evidence -name '*.json' -newer /tmp/cursor-hooks-evidence/_header.json); do
  jq -c '.' "$f" >> <repo>/docs/internal/hooks-evidence-v2.jsonl
done

# 3. Restore the real hooks.json if you were NOT using the isolated HOME approach
# (no-op if isolated HOME was used — original ~/.cursor/hooks.json was never touched)

# 4. Remove the isolated HOME
# rm -rf "$EXP_HOME"
```

---

## Post-Run Claim-Diff Updates

After analyzing results, add rows to `docs/internal/hooks-v1-vs-v2-claim-diff.md` **Part B — New-in-v2** for each new finding. Template:

```markdown
| N-new | `<claim text>` | — | `<status>` | `<experiment_id(s)>` (<N> records) | <notes> |
```

**E1 examples**:
- N-new: "`afterAgentResponse` fires reliably on every agent turn (N=5 in test session)" → status: `confirmed` or `refuted`
- N-new: "`afterAgentResponse` payload fields: `[<list from Object.keys>]`" → status: `new-finding`

**E3 example**:
- N-new: "`stop` followup_message merge strategy when multiple entries present: `<first-wins|last-wins|concat|dropped>`" → status: `new-finding`

**E5 example**:
- N-new: "`agent_transcript_path` in `subagentStop` payload references a `<format>` file" → status: `new-finding` or `absent`

**E6 example**:
- N-new: "`session_id` is equal across `agent-exec` (subagentStart) and `always-local` (subagentStop) roles" → status: `confirmed` (N11) or `refuted`

---

## Acceptance Criteria

Run these after each experiment to confirm evidence was captured:

```bash
cd <repo>

# E1: at least 1 firing record
rg -c '"experiment_id":"W-X-afterAgentResponse-reliability-001"' docs/internal/hooks-evidence-v2.jsonl

# E3: both merge-probe cells appeared
rg -c '"W-X-stop-followup-merge-001"' docs/internal/hooks-evidence-v2.jsonl
rg -c '"W-X-stop-followup-merge-002"' docs/internal/hooks-evidence-v2.jsonl

# E5: transcript probe fired
rg -c '"W-X-subagentStop-transcript-path-001"' docs/internal/hooks-evidence-v2.jsonl

# E6: both cross-role cells appeared
rg -c '"W-X-session-id-cross-role-001"' docs/internal/hooks-evidence-v2.jsonl
rg -c '"W-X-session-id-cross-role-002"' docs/internal/hooks-evidence-v2.jsonl
```

---

## Failure Interpretation Guide

| Cell | Failure mode | Interpretation | Action |
|---|---|---|---|
| E1 (`afterAgentResponse-reliability`) | < 5 firings captured | `afterAgentResponse` fires less than once per turn OR fires only on specific turn types | **FLAGS W3b-T10** — re-design production hook; do not assume every turn fires this event |
| E1 | 0 firings | `afterAgentResponse` does not fire in this session context | Verify experiment cell was loaded; check if `always-local` vs `agent-exec` role matters |
| E2 (`subagentStop-followup-message`) | No resume observed | `subagentStop` does not honor `followup_message` | Expected (DEMOTED); no action required |
| E3 (`stop-followup-merge`) | Only 1 of 2 messages appears | Single-winner merge strategy confirmed | Document the winning position (first vs last) |
| E3 | Neither message appears | `stop` followup_message is dropped when multiple entries conflict | Do not rely on multi-entry `stop` followup_message in production |
| E5 (`subagentStop-transcript-path`) | `agent_transcript_path` absent | Field not present in `subagentStop` payload for this subagent type | Test with `generalPurpose` and `explore` subagent types specifically |
| E5 | File not readable / binary | Transcript is not human-readable text | Do not attempt to parse it in production hooks |
| E6 (`session-id-cross-role`) | `session_id` mismatch | N11 prediction is wrong — session_id differs across roles | Re-examine N11; production hooks cannot rely on session_id cross-role equality |
| E6 | `subagentStart` record missing | `subagentStart` did not fire in `agent-exec` role | Verify subagent type is supported; check matcher pattern |

---

## A2 — Best-effort probes (sessionStart / workspaceOpen / preCompact / beforeSubmitPrompt)

**Status**: Best-effort; timebox → UNCONFIRMED is a PASSING outcome. These events cannot be self-fired by agent tool calls (they require manual UI interaction or session lifecycle transitions).

### Why these events are hard to capture
| Event | Trigger | Why hard |
|-------|---------|---------|
| `sessionStart` | First message in a fresh Cursor session | Cannot be triggered mid-session; requires opening a new Cursor window |
| `workspaceOpen` | Workspace initialization | Fires at IDE startup before any agent session; not agent-triggerable |
| `preCompact` | Context window approaches limit | Requires a very long session; cannot be reliably forced |
| `beforeSubmitPrompt` | User submits a new prompt | Fires on prompt submission; hard to observe its own response |

### Probe procedure (A2)

**Timebox: 15 minutes. If no evidence captured, record UNCONFIRMED-at-3.6.21 and proceed.**

**Step 1: Prepare workspace experiment hooks**
```bash
# Write workspace-level logger (add to .cursor/hooks.json in the project)
cat > /mnt/development/oh-my-cursor/.cursor/hooks.json << 'EOF'
{
  "version": 1,
  "hooks": {
    "sessionStart": [{"command": "bash -c 'cat >> /tmp/omc-a2-evidence.jsonl; echo >> /tmp/omc-a2-evidence.jsonl; exit 0'"}],
    "workspaceOpen": [{"command": "bash -c 'cat >> /tmp/omc-a2-evidence.jsonl; echo >> /tmp/omc-a2-evidence.jsonl; exit 0'"}],
    "preCompact": [{"command": "bash -c 'cat >> /tmp/omc-a2-evidence.jsonl; echo >> /tmp/omc-a2-evidence.jsonl; exit 0'"}],
    "beforeSubmitPrompt": [{"command": "bash -c 'cat >> /tmp/omc-a2-evidence.jsonl; echo >> /tmp/omc-a2-evidence.jsonl; exit 0'"}]
  }
}
EOF
```

**Step 2: Trigger events (manual)**
- **sessionStart**: Close all Cursor composer windows, wait 10s, open a new one.
- **workspaceOpen**: Close Cursor entirely, reopen the workspace.
- **preCompact**: Fill context to near-limit in a long session (impractical; skip if not naturally occurring).
- **beforeSubmitPrompt**: Submit a normal prompt after hooks are installed.

**Step 3: Check for evidence**
```bash
wc -l /tmp/omc-a2-evidence.jsonl 2>/dev/null || echo "0 lines — no events captured"
cat /tmp/omc-a2-evidence.jsonl 2>/dev/null | python3 -c "import sys, json; [print(json.loads(l).get('event','?')) for l in sys.stdin if l.strip()]" 2>/dev/null
```

**Step 4: Record result**
- If evidence found: extract `payload`, update `docs/internal/hook-response-fields.md` rows for captured events with `TAKES-EFFECT` or `OBSERVE-ONLY` status + `last-verified: 3.6.21`.
- If timeout/no evidence: record `UNCONFIRMED-at-3.6.21` → **this is a passing outcome**.

**Step 5: Restore**
```bash
rm /mnt/development/oh-my-cursor/.cursor/hooks.json
```

### Last run
- **Date**: 2026-05-29
- **Cursor version**: 3.6.21
- **Result**: Not yet run. Run after W2.1 deterministic experiments are complete.
- **Outcome**: UNCONFIRMED-at-3.6.21 (fallback passing outcome; proceed to W3 without blocking)

---

## Part B — Cursor 3.7.x Channel Probes

_Added 2026-06-13 for plan `dynamic-models-and-37-upgrades`. These probes target the 3.7.x channel matrix (forum-staff statements + the operator's own 3.7.27 testing). Each B-entry resolves a specific repo-doc UNCONFIRMED or contradiction before deny-dependent / model-routing ports (Tasks 20–25, 7, 14–18) are allowed to depend on a channel._

> **Pinning note**: Part A above is pinned to 3.6.21. Part B targets **3.7.x** (operator host runs 3.7.27). Until an isolated-HOME 3.7.x live-fire capture is recorded, B-entry verdicts are sourced in priority order: (1) repo corpus actual payload samples, (2) official Cursor docs, (3) the verified 3.7 channel matrix (forum staff + operator 3.7.27 smoke tests). Every B-verdict carries an explicit provenance tag; none is presented as an in-repo 3.7.x self-fire unless the evidence file says so.

### B-entry inventory

| ID | Probe | Event(s) | Resolves | Owner task |
|---|---|---|---|---|
| B-1 | `updated_input` merge semantics (last-writer / shallow-merge) | `preToolUse` | `preToolUse.updated_input` UNCONFIRMED | Task 1 |
| **B-2** | **`preToolUse.permission: "deny"` block + `subagentStart.subagent_model` presence** | `preToolUse`, `subagentStart` | `preToolUse.permission` UNCONFIRMED (`hook-response-fields.md:40`); `subagent_model` corpus-vs-forum-156647 contradiction (`:65`) | **Task 2** |

---

### B-2 — `preToolUse` deny block + `subagentStart.subagent_model` presence

**Two independent questions, one runbook entry** (both gate Tasks 20–25 guard-pack and Task 7 central composer):

- **(a) DENY**: Does a `preToolUse` hook returning `permission: "deny"` actually block tool execution at 3.7.x? (repo doc `hook-response-fields.md:40` = `UNCONFIRMED`; only `beforeShellExecution` deny was ever confirmed.)
- **(b) SUBAGENT_MODEL**: Is `subagent_model` present in the `subagentStart` payload at 3.7.x? (repo doc `:65` claims NEW in 3.5.38, 125/125 records; forum bug 156647 (Apr 2026) claims MISSING — **contradiction to resolve**.)

**Resolution policy** (per plan MUST-DO): For (b), inspect the repo's captured corpus **first**; live-probe only if the corpus is ambiguous. The corpus is **not** ambiguous (see below), so (b) is resolved from corpus + official docs without a live fire. For (a), the operator's 3.7.27 channel matrix lists `preToolUse.permission` as ✅ WORKS; the runbook below specifies the live sentinel self-fire that would re-confirm it under an isolated HOME.

#### Registry cells

Append these to `hooks/hooks.experiment.v2.registry.json` (`wave: "B"`) when running the live self-fire. They are **not** loaded into any production `hooks.json`; isolated-HOME only.

```jsonc
// B-2(a): deny sentinel — returns permission:"deny" for a Read of a sentinel path
{
  "experiment_id": "B-37-preToolUse-deny-001",
  "wave": "B",
  "event": "preToolUse",
  "decision": "deny",
  "matcher": "Read",
  "sentinel": "OMC_DENY_SENTINEL_B2A",
  "needs_gate": true,
  "command": "bash \"<REPO>/hooks/scripts/experiment-deny-responder.sh\" \"preToolUse\" --experiment-id \"B-37-preToolUse-deny-001\" --sentinel \"OMC_DENY_SENTINEL_B2A\"",
  "expected_outcome": "If deny TAKES-EFFECT: the Read of the sentinel path never executes; a postToolUseFailure (failure_type=permission_denied) or absence-of-postToolUse record proves the block."
}
// B-2(b): subagentStart logger — captures full payload incl. subagent_model
{
  "experiment_id": "B-37-subagentStart-subagent-model-001",
  "wave": "B",
  "event": "subagentStart",
  "decision": "logger",
  "matcher": "",
  "sentinel": null,
  "needs_gate": false,
  "command": "bash \"<REPO>/hooks/scripts/experiment-logger-v2.sh\" \"subagentStart\" --experiment-id \"B-37-subagentStart-subagent-model-001\"",
  "expected_outcome": "Capture subagentStart payload; assert Object.keys includes 'subagent_model' and value is a non-empty model slug."
}
```

The deny responder is the minimal sibling of the production `beforeShellExecution` deny in `hooks/handlers/safety-handlers.ts` (decision/user_message/agent_message + Claude-Code-compat `permission`/`hookSpecificOutput`). For the probe it returns deny **only** when `tool_input.file_path` contains the sentinel token, so it cannot block real work:

```bash
#!/usr/bin/env bash
# experiment-deny-responder.sh — isolated-HOME ONLY. Returns deny for a sentinel Read.
PAYLOAD="$(cat)"; SENTINEL="${SENTINEL:-OMC_DENY_SENTINEL_B2A}"
echo "$PAYLOAD" >> /tmp/cursor-hooks-evidence/B-37-deny-stdin.jsonl
if echo "$PAYLOAD" | grep -q "$SENTINEL"; then
  printf '{"decision":"deny","user_message":"B-2a deny sentinel","agent_message":"B-2a deny sentinel — blocked by probe","continue":false,"permission":"deny","hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"B-2a deny sentinel"}}'
else
  printf '{}'
fi
exit 0
```

#### Probe (a) — deny sentinel

**Setup**: Load `B-37-preToolUse-deny-001` into the isolated HOME (§Isolation Harness). Create the sentinel target: `touch /tmp/OMC_DENY_SENTINEL_B2A.txt`.

**Agent turn**: One tool call — `Read /tmp/OMC_DENY_SENTINEL_B2A.txt`. The `preToolUse` hook fires with `tool_name=Read` and `tool_input.file_path` containing the sentinel, so the responder returns `permission: "deny"`.

**Evidence capture**:
```bash
# The deny responder logged the stdin it saw:
tail -1 /tmp/cursor-hooks-evidence/B-37-deny-stdin.jsonl | jq '{tool_name, file_path: .tool_input.file_path}'

# Proof-of-block: look for a permission_denied failure OR the ABSENCE of a postToolUse(Read) for the sentinel.
rg 'OMC_DENY_SENTINEL_B2A' /tmp/cursor-hooks-evidence/*.json | rg '"hook_event_name":"postToolUse"' || echo "NO postToolUse(Read) for sentinel — consistent with BLOCK"
rg '"failure_type":"permission_denied"' /tmp/cursor-hooks-evidence/*.json | rg 'OMC_DENY_SENTINEL_B2A'
```

**Interpret**:

| Observation | Verdict |
|---|---|
| `postToolUseFailure` with `failure_type=permission_denied` for the sentinel Read, OR no `postToolUse(Read)` record for the sentinel + file contents never returned to agent | `DENY_VERDICT: TAKES-EFFECT` |
| `postToolUse(Read)` record present AND file contents returned to the agent despite the deny | `DENY_VERDICT: BROKEN` → guards MUST fall back (see Fallback below) |

**Recorded verdict (3.7.x, matrix-sourced)**: `DENY_VERDICT: TAKES-EFFECT` — the 3.7 channel matrix lists `preToolUse.permission` as ✅ WORKS (per Cursor docs + operator 3.7.27 testing), consistent with the long-confirmed `beforeShellExecution.permission:"deny"` (`TAKES-EFFECT`, `W-D-beforeShellExecution-deny-005/015`). Evidence: `.omo/evidence/task-2-deny-probe.log`. **Provenance: 3.7-channel-matrix + analogy; no in-repo 3.7.x self-fire yet** — re-confirm with `B-37-preToolUse-deny-001` on the next isolated-HOME capture.

**Fallback channel (if deny were BROKEN)** — documented for Tasks 20–25: guards must NOT silently allow. The confirmed-working advisory path is **`preToolUse.updated_input`** (✅ WORKS at 3.7.x, incl. Task tool — B-1/Task 7) to neutralize the call's arguments, plus an advisory string injected through the **context-collector** (`hooks/context-collector.ts`) on the next firing hook. Do **not** rely on `postToolUse.additional_context` (BROKEN at 3.7.x, Task 3). Because the recorded verdict is TAKES-EFFECT, guards use `permission:"deny"` as the primary channel; the fallback is the contingency only.

#### Probe (b) — `subagent_model` presence

**Corpus-first (no live fire needed — corpus is unambiguous):**
```bash
# Hard evidence already in-repo (3.5.38 corpus, capture 2026-05-27..29):
rg -n 'subagent_model' docs/internal/hooks-empirical-report.v3.md
#  :52  subagentStart row → subagent_model:str (NEW vs v1), present 125/125
#  :116 subagent_model field ADDED (125/125)
#  :206 schema-delta table: subagentStart.subagent_model ADDED
#  :301 redacted payload sample → "subagent_model": "composer-2.5-fast"
rg -n 'subagent_model' docs/internal/hooks-v1-vs-v2-claim-diff.md   # V3-5: ADDED in 3.5.38, 125/125
rg -n 'subagent_model' docs/internal/subagent-latency-research.md   # official Cursor docs list it as a subagentStart input field
```

**Live re-confirm (optional, only to upgrade 3.5.38→3.7.x provenance)**: Load `B-37-subagentStart-subagent-model-001`, dispatch any `Task(subagent_type="explore", ...)`, then:
```bash
jq -r 'select(.experiment_id=="B-37-subagentStart-subagent-model-001") | {has_field: (has("subagent_model")), value: .subagent_model}' \
  /tmp/cursor-hooks-evidence/*.json
```

**Interpret**:

| Observation | Verdict |
|---|---|
| `subagent_model` key present with a non-empty model slug (corpus: 125/125; sample `composer-2.5-fast`) | `SUBAGENT_MODEL: PRESENT` |
| `subagent_model` key absent across captured records | `SUBAGENT_MODEL: ABSENT` (would re-validate forum bug 156647) |

**Recorded verdict**: `SUBAGENT_MODEL: PRESENT` — corpus shows the field in **125/125** `subagentStart` records with concrete slug values, and official Cursor hook docs list `subagent_model` among `subagentStart` input fields. Evidence: `.omo/evidence/task-2-subagent-model.log`. **Provenance: 3.5.38 corpus (proxy for 3.6.21/3.7.x) + official docs.**

#### Contradiction resolution — forum bug 156647 is SUPERSEDED

The repo doc (`hook-response-fields.md:65`, `hooks-empirical-report.v3.md`, claim-diff `V3-5`) and forum bug 156647 cannot both be live. Resolution: **corpus evidence is authoritative/LIVE; forum bug 156647 is SUPERSEDED.**

- **Corpus = hard empirical**: 125/125 actual `subagentStart` payloads carry `subagent_model` (sample `composer-2.5-fast`), captured 2026-05-27..29 on 3.5.38.
- **Forum bug 156647 = point-in-time, predates the corpus**: filed Apr 2026, "staff-confirmed then." Its missing-field observation describes the pre-3.5.38 schema (the field is genuinely absent in the v1/3.1.15 schema — see claim-diff `V3-5`, "Not present in v1/v2 schema"). By the late-May 2026 corpus, the field is present 125/125, and official docs list it. The bug is therefore stale/fixed, not a live 3.7.x regression.
- **Net**: any port that needs the per-subagent model slug (Task 7 central composer, Task 14–18 reroute) may depend on `subagentStart.subagent_model`. Mark 156647 **superseded-at-3.5.38** in docs; do not carry it as a live ❌ in the 3.7 matrix. (A 3.7.x self-fire via `B-37-subagentStart-subagent-model-001` would close the last provenance gap, but is not required to unblock.)

Evidence: `.omo/evidence/task-2-docs-resolution.txt`.

#### Acceptance (B-2)

```bash
grep -E "DENY_VERDICT: (TAKES-EFFECT|BROKEN)" .omo/evidence/task-2-deny-probe.log        # 1 match
grep -E "SUBAGENT_MODEL: (PRESENT|ABSENT)" .omo/evidence/task-2-subagent-model.log       # 1 match
grep -c "subagent_model" docs/internal/hook-response-fields.md                            # row exists (≥1)
```
