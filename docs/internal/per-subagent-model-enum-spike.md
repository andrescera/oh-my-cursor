# Spike: Is the Cursor `task` tool `model` enum encoded PER `subagent_type`?

_Created: 2026-06-13. READ-ONLY runbook-guided bundle inspection._

VERDICT: B

> **B = flat-only.** The `model` enum is **not** encoded per `subagent_type` anywhere in
> the Cursor bundle. `model`/`model_id` is a single flat free-form string field, sibling
> to `subagent_type`. The only per-`subagent_type` model association that exists is a
> **dynamic, user-configurable runtime override list** (`agent.v1.SubagentModelOverride`),
> which is settings state — not a static schema enum that can be extracted from the bundle
> as a seed. Therefore there is **nothing per-type to auto-extract**; the curated map stays
> authoritative.

---

## Go / No-Go for Task 13

**NO-GO for conditional auto-extraction of a per-`subagent_type` model enum.**
The bundle exposes a flat model union (already what `hooks/lib/task-schema-introspector.ts`
harvests via `extractSlugCluster`) plus a flat `subagent_type` enum. The two are orthogonal
fields; no static structure ties a model subset to a subagent type. Auto-extraction would
have nothing type-specific to read. Keep the curated `agent_overrides` map as the source of
truth and continue flat-union introspection for slug validation only.

---

## Method (runbook adherence)

Followed `docs/internal/hooks-experiments-runbook.md` for the READ-ONLY portion. This spike
performs **no** hook firing, loads **no** `hooks.json`, and makes **no** binary/bundle
modification — it is pure bundle introspection, mirroring the path-resolution +
file-walk strategy already implemented in `hooks/lib/task-schema-introspector.ts`
(`resolveCandidatePaths` → `walkAndScan` → `extractSlugCluster`).

### Pre-flight (runbook §Pre-flight) — provenance

| Check | Runbook §Pre-flight (Part A pin) | Observed (this host) |
|---|---|---|
| `cursor --version` | 3.6.21 | **3.7.36** (`776d1f9d76df50a4e0aeca61819a88e7c1b861e0`, x64) |
| workbench `sha256` | `205317ade21ccf6a2b415ef7fa63c1e4c5d394db626f7ada0151a943e1ecc950` | **`b97bba14fcc324b5210f5c852abcfa2c18f6d3266ab9ce9162874406f6b7d91e`** |
| bundle path | `/usr/share/cursor/resources/app/out/vs/workbench/workbench.desktop.main.js` | present (61,212,725 bytes) |
| `bun` on PATH | required | 1.3.14 |

> **Provenance caveat:** the host is on the **3.7.x channel** (3.7.36), not the Part A
> 3.6.21 pin. This matches the runbook's **Part B — Cursor 3.7.x Channel Probes** scope
> ("operator host runs 3.7.27"). For a read-only structural inspection of the proto/tool
> schema this is the correct, more current target; the version + sha256 are recorded above
> so the finding can be re-confirmed if the schema shape changes on a future channel.

### Bundle files inspected (read-only)

Resolved via the same Linux candidate path `/usr/share/cursor/resources/app`
(`resolveCandidatePaths`, `task-schema-introspector.ts:139-169`). Files carrying the
`task`/subagent schema:

- `extensions/cursor-agent-exec/dist/main.js` — primary; 94× `subagent_type`, holds the
  proto message + enum definitions for the Task tool wire format.
- `out/vs/workbench/workbench.desktop.main.js` — 74× `subagent_type` (mirrors the same
  proto definitions under minified symbol names `D4n`/`iqe`).
- `extensions/cursor-agent-worker/dist/main.js`, `extensions/cursor-always-local/dist/main.js`,
  `out/vs/workbench/api/node/extensionHostProcess.js` — same proto definitions, corroborating.

Cursor's wire format is **protobuf-es (proto3)**, not JSON-Schema-with-`enum`-arrays. The
schema therefore lives in `proto3.util.newFieldList(...)` field lists and
`proto3.util.setEnumType(...)` enum definitions.

---

## Evidence (redacted/representative bundle snippets)

### E1 — The Task tool input schema: `model` and `subagent_type` are FLAT siblings

`agent.v1.TaskToolCallArgsProto` — the wire schema produced when the `task` tool is called
(`extensions/cursor-agent-exec/dist/main.js`):

```js
typeName="agent.v1.TaskToolCallArgsProto";static fields=…newFieldList(()=>[
  {no:1,name:"description",      kind:"scalar",T:9},
  {no:2,name:"prompt",          kind:"scalar",T:9},
  {no:3,name:"model",           kind:"scalar",T:9,opt:!0},   // <- flat optional STRING, not enum
  {no:4,name:"subagent_type",   kind:"scalar",T:9},          // <- flat STRING, sibling of model
  {no:5,name:"resume",          kind:"scalar",T:9,opt:!0},
  {no:6,name:"readonly",        kind:"scalar",T:8,opt:!0},
  {no:7,name:"run_in_background",kind:"scalar",T:8,opt:!0},
  {no:8,name:"attachments",     kind:"scalar",T:9,repeated:!0},
  {no:9,name:"environment",     kind:"enum",  T:…getEnumType(s)},
  {no:10,name:"cloud_base_branch",kind:"scalar",T:9,opt:!0}
])
```

`agent.v1.SubagentArgs` class defaults — same flat shape (`model_id` is a plain string):

```js
class … extends Message{ toolCallId=""; subagentType=""; modelId=""; prompt=""; readonly=!1; … }
// field list: {no:2,name:"subagent_type",kind:"scalar",T:9}, {no:3,name:"model_id",kind:"scalar",T:9}
```

→ `model`/`model_id` (T:9 = proto string) is a **free-form scalar**, not even an enum, and
sits beside `subagent_type` with no nesting. No per-type model encoding here.

### E2 — The native `subagent_type` enum drives params/return, NOT model

`aiserver.v1.SubagentType`:

```js
setEnumType(M,"aiserver.v1.SubagentType",[
  {no:0,name:"SUBAGENT_TYPE_UNSPECIFIED"},
  {no:1,name:"SUBAGENT_TYPE_DEEP_SEARCH"},
  {no:2,name:"SUBAGENT_TYPE_FIX_LINTS"},
  {no:3,name:"SUBAGENT_TYPE_TASK"},
  {no:4,name:"SUBAGENT_TYPE_SPEC"}
])
```

Where this enum *is* used as a discriminator, it selects a **`oneof` of params / return
values** — never a model set (`aiserver.v1.SubagentInfo` / `SubagentReturnCall`):

```js
{no:1,name:"subagent_type",kind:"enum",T:getEnumType(M)},
{no:3,name:"deep_search_params",kind:"message",…,oneof:"params"},
{no:4,name:"fix_lints_params", kind:"message",…,oneof:"params"},
{no:6,name:"task_params",      kind:"message",…,oneof:"params"},
{no:7,name:"spec_params",      kind:"message",…,oneof:"params"}
```

> Note: these are Cursor's **native** subagent types. oh-my-cursor's agent types
> (`explore`, `librarian`, `sisyphus`, …) are **not** in the bundle (`grep librarian` →
> 0 hits); they ride in as free-string `subagent_type` values via rules/config. So even the
> `subagent_type` axis is open-ended at the wire level, which is itself incompatible with a
> static per-type model enum.

### E3 — Per-type model exists ONLY as a dynamic user-config override (not a schema enum)

`agent.v1.SubagentModelOverride`:

```js
typeName="agent.v1.SubagentModelOverride";static fields=…newFieldList(()=>[
  {no:1,name:"subagent_type",kind:"scalar",T:9},                 // free-string key
  {no:2,name:"model",   kind:"message",T:…,oneof:"selection"},   // a model SELECTION ref
  {no:3,name:"inherit", kind:"scalar",T:8,oneof:"selection"},
  {no:4,name:"disabled",kind:"scalar",T:8,oneof:"selection"}
])
```

And resolution is done at runtime per launched subagent
(`agent.v1.PreparedTaskSubagent` → `resolved_model_id` scalar string):

```js
{no:2,name:"subagent_type_name",kind:"scalar",T:9},
{no:4,name:"analytics_subagent_type",kind:"scalar",T:9},
{no:5,name:"resolved_model_id",kind:"scalar",T:9}   // resolved at dispatch, free string
```

This is **settings state**, populated by the user (Cursor's per-subagent model settings),
keyed by an arbitrary `subagent_type` string, with each entry a `oneof{model, inherit,
disabled}`. It is not a static enum baked into the bundle, so it cannot be read as a
deterministic per-type seed.

### E4 — Negative checks (ruling out per-type encoding)

- No JSON-Schema `oneOf`/`anyOf`/`if-then` discriminated by `subagent_type` carrying a
  `model` enum (grep across `cursor-agent-exec` + `workbench` → 0 hits).
- No object literal mapping a subagent type → a model array (e.g. `deep_search:[…composer…]`)
  → 0 hits.
- The only model collection in the bundle is a **flat slug union** (representative sample):
  `composer-1`, `composer-1.5`, `composer-2`, `composer-2.5`, `composer-2.5-fast`,
  `composer-2.6`, `claude-4.5-sonnet`, `claude-4.5-opus`, `claude-4.5-opus-high`,
  `claude-sonnet-4`, `gemini-3-pro`, `gemini-3.1-pro`, `gemini-3-flash`, `gpt-5.4`, `gpt-5.5`,
  `grok-*`. This flat cluster is exactly what `extractSlugCluster`
  (`task-schema-introspector.ts:425-441`) already harvests — confirming the current flat
  extraction is the correct and only available shape.

---

## Conclusion

The `task` tool encodes `model` (string) and `subagent_type` (string) as **independent flat
fields**. The native `subagent_type` enum partitions *behavior* (`oneof` params/return), not
*model choice*. Per-`subagent_type` model assignment is real but lives in **mutable user
settings** (`SubagentModelOverride` → `resolved_model_id`), not in any static, bundle-encoded
enum. There is no extractable per-type model enum to seed a curated map.

**VERDICT: B (flat-only).** No per-`subagent_type` mapping section is provided because none
is extractable (that section is required only for VERDICT A).
