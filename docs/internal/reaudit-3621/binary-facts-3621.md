# Binary Fact Sheet — Cursor 3.6.21 (re-audit)

> Fresh, live-extracted facts for Cursor **3.6.21**, re-verifying every value
> currently pinned to **3.0.16** in `docs/cursor/16-binary-analysis.md`.
> This file is the HARD GATE of the re-audit; the canonical hook-event set
> confirmed here drives downstream docs and the test suite.
>
> **Environment:** Linux, Cursor at `/usr/share/cursor/resources/app/`
> **Extraction date:** 2026-05-29
> **Method:** `product.json` via `python3`/`jq`; `workbench.desktop.main.js` via `ripgrep`/`python3`.
> Every value below comes from the live binary. Items that could not be
> confirmed are marked `UNVERIFIED — <reason>` (none required this run).

---

## GATE A — Canonical HOOK STEP EVENTS (3.6.21)

**CANONICAL COUNT: 21** (was 20 in 3.0.16) — **+1 added, 0 removed.**

Source of truth: the self-mapping enum object assigned to identifier **`Iv`**
(was `bv` in 3.0.16) at **byte offset 23065128** (line 35968 of the 59004-line
minified bundle). Each of the 21 keys maps to itself, and a parallel ordered
array lists the identical 21 names. Confirmed by an exact key-count of the `Iv`
object (21 keys) and by counting each literal independently.

**Canonical sorted name list (21):**

```
afterAgentResponse
afterAgentThought
afterFileEdit
afterMCPExecution
afterShellExecution
afterTabFileEdit
beforeMCPExecution
beforeReadFile
beforeShellExecution
beforeSubmitPrompt
beforeTabFileRead
postToolUse
postToolUseFailure
preCompact
preToolUse
sessionEnd
sessionStart
stop
subagentStart
subagentStop
workspaceOpen          <-- NEW in 3.6.21
```

- All **20** events from the 3.0.16 doc are still present and unchanged.
- **`workspaceOpen` is NEW.** It appears exactly twice (the `Iv` enum object +
  the ordered canonical array). No human-readable label was found wired up for
  it yet (it is not in the `*->UserPromptSubmit/Write/Read/...` Claude-Code name
  map), so it is defined-but-lightly-wired.
- `cursorHooksService` and all documented methods remain present:
  `executeHookForStep` (21 hits), `hasHookForStep` (19), `hasAnyHooks` (3),
  `getAllConfiguredHooks` (5), `getHooksCounts` (2), `onDidHooksChange` (13).

> **DOWNSTREAM (W5 tests):** `CANONICAL_CURSOR_HOOKS` must contain exactly the
> 21 names listed above.

---

## GATE B — AGENT TOOL NAME count (3.6.21)

The 3.0.16 doc states **"78 unique tools"** derived "from `_params` / `_result`
/ `_stream` pattern matching." **That figure is NOT cleanly reproducible** and
should be treated with caution (see issues.md): the doc's own enumerated prose
list contains ~98 distinct names while claiming 78, and several listed names
(`browser_screenshot`, `codebase_search`, `synthesis_subagent`) do not use the
suffix pattern at all — meaning the original 78 mixed multiple extraction
methods.

**Fresh 3.6.21 extraction via the documented `_(params|result|stream)` regex
over the live bundle:**

| Metric (regex `"<name>_(params|result|stream)"`) | Count |
|---|---|
| Distinct prefixes (raw superset, incl. infra/classifier noise) | **141** |
| Prefixes with a `_params` literal | **85** |
| Prefixes with **both** `_params` AND `_result` (best genuine-tool proxy) | **67** |
| Prefixes with a `_stream` literal | **54** |

**Recommended canonical figure for reconciliation: 67** genuine request/response
tools (have both `_params` and `_result`). The 85 (`has _params`) and 141 (raw)
are reported for transparency.

**NEW genuine tools in 3.6.21 (params+result, not in doc's list):**
`read_file_v2`, `list_dir_v2`, `task_v2`, `run_terminal_command_v2`
(versioned successors alongside the still-present v1 forms).

**Doc-listed tools now ABSENT (0 literal occurrences) — likely renamed/removed:**
- `browser_screenshot` → 0 (browser tooling restructured; `browser_click`,
  `browser_navigate`, `browser_scroll`, `browser_type` still present)
- `codebase_search` → 0 (superseded by `semantic_search` / `semantic_search_full`)
- `synthesis_subagent` → 0 (was "inferred" in the doc; only the Statsig key
  `synthesis_subagent_config` exists)

**Doc tools registered without the suffix pattern, still present as literals:**
`bash` (38), `cursor_rules` (12), `fetch_mcp_resource` (1),
`browser_click`/`browser_navigate`/`browser_scroll`/`browser_type`.

> **DOWNSTREAM (W4):** Use **67** as the reconciled genuine-tool count for
> 3.6.21 and flag the doc's "78" as non-reproducible.

---

## 1. product.json — Identity & Flags

`/usr/share/cursor/resources/app/product.json` — 87 top-level keys, 57 KB.

| Key | 3.0.16 (old) | 3.6.21 (new) | Δ |
|-----|------|------|---|
| `version` | `3.0.16` | **`3.6.21`** | changed |
| `vscodeVersion` | `1.105.1` | `1.105.1` | same |
| `commit` | `475871d1…baa0c50` | **`e7a7e93f4d75f8272503ecf33cedbaae10114a10`** | changed |
| `realCommit` | `…baa0c54` | **`e7a7e93f4d75f8272503ecf33cedbaae10114a15`** (last char differs from commit, ends `15` vs `10`) | changed |
| `date` | `2026-04-09T05:33:51.767Z` | **`2026-05-28T21:45:36.072Z`** | changed |
| `quality` | `stable` | `stable` | same |
| `applicationName` | `cursor` | `cursor` | same |
| `serverApplicationName` | `cursor-server` | `cursor-server` | same |
| `dataFolderName` | `.cursor` | `.cursor` | same |
| `darwinBundleIdentifier` | `com.todesktop.230313mzl4w4u92` | `com.todesktop.230313mzl4w4u92` | same |
| `win32AppUserModelId` | `Anysphere.Cursor` | `Anysphere.Cursor` | same |
| `linuxIconName` | `co.anysphere.cursor` | `co.anysphere.cursor` | same |
| `urlProtocol` | `cursor` | `cursor` | same |
| `enableTelemetry` | `true` | `true` | same |
| `removeTelemetryMachineId` | `true` | `true` | same |
| `enabledTelemetryLevels` | `{error:true, usage:true}` | `{error:true, usage:true}` | same |
| `simulateProdOnDev` | `false` | `false` | same |
| `statsigLogEventProxyUrl` | `https://api3.cursor.sh/tev1/v1` | `https://api3.cursor.sh/tev1/v1` | same |
| `statsigClientKey` present? | yes | yes (value omitted per policy) | same |

**`cursorTrustedExtensionAuthAccess`** (unchanged):
`anysphere.cursor-retrieval`, `anysphere.cursor-commits`

**`cannotImportExtensions`** (unchanged):
`github.copilot-chat`, `github.copilot`, `ms-vscode.remote-explorer`

**`skipPackagingLocalExtensions`** (unchanged): `cursor-context-ast-typescript`

**`extensionReplacementMapForImports`** keys (unchanged, 8):
`ms-vscode-remote.remote-ssh`, `ms-vscode-remote.remote-containers`,
`ms-vscode-remote.remote-wsl`, `jeanp413.open-remote-ssh`,
`jeanp413.open-remote-wsl`, `ms-python.vscode-pylance`, `ms-vscode.cpptools`,
`ms-dotnettools.csharp`

### Checksums (product.json, base64 SHA-256)

| File | 3.0.16 (old base64) | 3.6.21 (new base64) |
|------|------|------|
| `vs/workbench/workbench.desktop.main.js` | `oslZMHp29tLjQ0JOLR7bMBq+q7PNg1f3A3Y3ZVLJvIg` | **`IFMXreIcz2orQV73+mPB5MXTlNtib3raAVGpQ+HsyVA`** |
| `vs/code/electron-sandbox/workbench/workbench.html` | `E6RG2gbwOjtPjaYkC1efQqCWiKpnCZMWMfP5HSPG4/A` | **`g2I3CZ/xPc/Mp8LOXiN6rdC20u8PNfzsAesoQeNeswg`** |
| `vs/base/parts/sandbox/electron-sandbox/preload.js` | `a2wyuvLuF/KaIMb1CBWByRWQFNsEqYWE4otiQ3iMw/Q` | **`EpLUvbBCdWP0lXuFoDAfomYd6KZPq7ntPkZS2ngJvuc`** |

(Full checksum key set also includes `workbench.desktop.main.css`,
`api/node/extensionHostProcess.js`, `electron-sandbox/workbench/workbench.js`.)

---

## 2. workbench.desktop.main.js — size & hash

`/usr/share/cursor/resources/app/out/vs/workbench/workbench.desktop.main.js`

| Metric | 3.0.16 (old) | 3.6.21 (new) |
|--------|------|------|
| Byte size | 56,451,489 | **61,321,015** (confirmed; ~+8.6%) |
| SHA-256 (hex) | — | **`205317ade21ccf6a2b415ef7fa63c1e4c5d394db626f7ada0151a943e1ecc950`** |
| SHA-256 (base64, product.json format) | `oslZMHp29tLjQ0JOLR7bMBq+q7PNg1f3A3Y3ZVLJvIg` | **`IFMXreIcz2orQV73+mPB5MXTlNtib3raAVGpQ+HsyVA`** |
| Lines | — | 59004 (minified; enum `Iv` on line 35968) |

- Byte size **61,321,015 confirmed** (matches the plan's expected ~61,321,015).
- Hex SHA-256 **re-confirms** the W0 evidence value `205317ade…ecc950`.
- The freshly-computed base64 SHA-256 (`IFMXreIcz2orQV73…HsyVA`) **exactly equals
  the `product.json` checksum entry** for this file → bundle integrity verified.

---

## 3. node_modules inventory

`/usr/share/cursor/resources/app/node_modules/`

| Metric | 3.0.16 (old) | 3.6.21 (new) |
|--------|------|------|
| Top-level entries | 334 | **364** (+30) |
| Scoped (`@…`) namespaces | — | **29** |

> Note: the live shell's `ls | sort` hung repeatedly on this directory; counts
> were obtained reliably via `python3 os.listdir` instead (see issues.md).

**Scoped namespaces (29):** `@anysphere`, `@apm-js-collab`, `@azure`, `@bufbuild`,
`@c4312`, `@connectrpc`, `@dnd-kit`, `@fastify`, `@hono`, `@isaacs`, `@jimp`,
`@lukeed`, `@microsoft`, `@modelcontextprotocol`, `@novnc`, `@opentelemetry`,
`@parcel`, `@pkgjs`, `@prisma`, `@protobufjs`, `@sentry`, `@sentry-internal`,
`@tanstack`, `@tokenizer`, `@tootallnate`, `@types`, `@typespec`, `@vscode`,
`@xterm`.

**Cursor/Anysphere-specific (doc list re-verified, all PRESENT):**
- `@anysphere/policy-watcher` ✓
- `@apm-js-collab/code-transformer` ✓, `@apm-js-collab/tracing-hooks` ✓
- `cursor-proclist` ✓ (only `cursor-*` unscoped package)

**Doc "notable non-standard" packages re-verified (all PRESENT):**
`@novnc/novnc` ✓, `@prisma/instrumentation` ✓, `@bufbuild/protobuf` ✓,
`@connectrpc/connect` + `@connectrpc/connect-node` ✓, `@tanstack/query-core` +
`react-query` + `solid-query` ✓, `@typespec/ts-http-runtime` ✓,
`chrome-remote-interface` ✓, `cockatiel` ✓, `@sentry` + `@sentry-internal` ✓,
`@jimp` + `jimp` ✓, `@opentelemetry/*` ✓, `@dnd-kit/*` ✓, `@tokenizer/token` ✓.

**NEW / notable additions vs the doc's highlighted list:**
- **`@modelcontextprotocol/sdk`** — official MCP SDK now bundled (significant for
  hooks/MCP execution paths).
- **`@hono/node-server`** and **`@fastify/busboy`** — HTTP server / multipart
  parsing (local server surface).
- `@tanstack` expanded: now also `react-virtual`, `solid-virtual`,
  `virtual-core` (virtualized lists).
- `@sentry` expanded: now also `node-core` (+ `browser`, `core`, `electron`,
  `node`, `opentelemetry`, `types`).
- New scoped namespaces present that the doc did not call out: `@c4312`,
  `@fastify`, `@hono`, `@isaacs`, `@lukeed`, `@pkgjs`, `@protobufjs`,
  `@tootallnate`.

No doc-listed package was REMOVED.

---

## 4. Composer modes

All **9** documented named modes still present. (Raw `"<mode>"` literal counts
are noisy because words like "agent"/"background"/"normal" recur in unrelated
strings, so they are not a clean frequency signal — reported for completeness
only.)

| Mode | 3.0.16 occ. | 3.6.21 raw `"mode"` occ. |
|------|------|------|
| `agent` | 240 | 343 |
| `background` | 462 | 345 |
| `chat` | 111 | 107 |
| `debug` | 168 | 165 |
| `edit` | 49 | 98 |
| `normal` | 293 | 197 |
| `plan` | 126 | 150 |
| `project` | 111 | 166 |
| `spec` | 16 | 21 |

No NEW named composer mode string was identified beyond these 9.

---

## 5. Models referenced

**OLD slugs re-checked:**
- `claude-4-5-sonnet-20250929` — **still present** (1)
- `claude-3.7-sonnet-finetuned-cursor-20250514-v1` — **still present** (1)
- `claude-3-haiku-20240307` — still present (1)
- `gemini-2.5-pro` — still present (2)
- `gpt-5.2-codex-high` — **REMOVED** (0 occurrences in 3.6.21)

**Full live Claude set:** `claude-3.5-sonnet`, `claude-3.7-sonnet`,
`claude-3.7-sonnet-finetuned-cursor-20250514-v1`, `claude-3-haiku-20240307`,
`claude-3-opus-20240229`, `claude-3-sonnet-20240229`, `claude-4-sonnet`,
`claude-4-opus`, `claude-4.5-sonnet`, `claude-4.5-haiku`, `claude-4.5-opus-high`,
`claude-4.5-opus-high-thinking`, `claude-4-5-sonnet-20250929`,
`claude-4.6-opus-high-fast`, `claude-code`.

**GPT / O-series:** `gpt-3.5-turbo`, `gpt-4`, `gpt-4o`, `gpt-4o-mini`, `gpt-5`,
`gpt-5.1-codex`, **`gpt-5.5` (NEW)**, `o1`, `o1-mini`, `o1-preview`, `o3`,
`o3-mini`. (`gpt-5.2-codex-high` gone.)

**Gemini:** `gemini-1.5-flash`, `gemini-1.5-flash-8b`, `gemini-1.5-preview`,
`gemini-2.5-flash`, `gemini-2.5-pro`. (No `gemini-3.x` present yet.)

**NEW model families in 3.6.21 (not in the 3.0.16 doc):**
- **Cursor "Composer" models:** `composer-1`, `composer-2`, `composer-2.5`,
  `composer-2.5-fast`, `composer-2-training`, `composer-2-matterhorn-training`.
- **Grok:** `grok-3`, `grok-4`, `grok-composer-2`, `grok-composer-2.5`.
- **OpenAI:** `gpt-5.5`.

> Cross-feeds the CLI / model-list task: 3.6.21 adds the Composer and Grok
> families and `gpt-5.5`; drops `gpt-5.2-codex-high`. `gemini-3.x` NOT present.

---

## 6. removeLinesBeforeCompiling array

`removeLinesBeforeCompilingIfTheyContainTheseWords`

| Metric | 3.0.16 (old) | 3.6.21 (new) |
|--------|------|------|
| Entry count | 41 | **42** (+1) |

- All **41** entries from the 3.0.16 doc are still present.
- **NEW (1):** `__GULPFILE_REMOVE_LINE_BEFORE_COMPILING____disable_local_mode__`
  (a new compile-time strip for a "local mode" capability).
- No entries removed.

---

## 7. Statsig configs & API endpoints (spot-check)

Documented config-name and endpoint sets still hold. Spot-checks:

**Config names present (sample, hooks/agents/skills-related):**
`hooks_config`, `agent_telemetry_config`, `agent_url_config`,
`meta_agent_config`, `quick_agent_model_config`, `synthesis_subagent_config`,
`webhook_config`, and **NEW `composer_session_goal_hook_prompt_config`**
(hook-prompt related — notable addition).

**Endpoint sanity (all still present in bundle):**
`agent.api5.cursor.sh` (2), `api3.cursor.sh` (4), `marketplace.cursorapi.com`
(5), `cursorvm-manager.com` (27 host literals), `review.cursor.com` (2).

---

## Summary of OLD → NEW deltas

| Item | 3.0.16 | 3.6.21 | Verdict |
|------|--------|--------|---------|
| version | 3.0.16 | **3.6.21** | changed |
| vscodeVersion | 1.105.1 | 1.105.1 | same |
| commit | 475871…c50 | **e7a7e9…a10** | changed |
| realCommit | 475871…c54 | **e7a7e9…a15** | changed |
| date | 2026-04-09 | **2026-05-28** | changed |
| workbench bytes | 56,451,489 | **61,321,015** | changed |
| workbench sha256 (b64) | oslZ… | **IFMX…** | changed |
| node_modules | 334 | **364** | +30 |
| **HOOK EVENTS (GATE A)** | **20** | **21** | **+`workspaceOpen`** |
| **AGENT TOOLS (GATE B)** | "78" (unreliable) | **67** genuine / 85 params / 141 raw | reconciled |
| composer modes | 9 | 9 | same |
| removeLines array | 41 | **42** | +`disable_local_mode` |
| `gpt-5.2-codex-high` | present | **removed** | removed |
| Composer/Grok/gpt-5.5 models | absent | **present** | added |

*Do not edit `docs/cursor/16-binary-analysis.md` from this fact sheet; corrections
land in a later wave.*
