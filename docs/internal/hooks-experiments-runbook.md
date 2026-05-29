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
