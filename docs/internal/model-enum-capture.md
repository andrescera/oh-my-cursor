# Model Enum Capture

_Created: 2026-06-13. Internal reference for the server-side model enum injection, resolution precedence, capture workflow, and stale-window limitation._

---

## Background

The Cursor `Task()` `model` field is a flat free-form protobuf string at the wire level (proto3 scalar T:9, confirmed in [`per-subagent-model-enum-spike.md`](per-subagent-model-enum-spike.md)). No static enum constrains it in the bundle.

The enum the agent sees — the dropdown of valid model slugs — is assembled **server-side per session/account** and injected into the agent context as part of the `task` tool's function schema. This injection happens at session start; the agent reads it from its own tool descriptor.

No local artifact holds the current enum reliably. Empirically, 7 of 9 live slugs captured from a Cursor 3.7.36 session are absent from both the bundle slug union and `KNOWN_CURSOR_MODELS`:

```
claude-4.6-sonnet-high-thinking    # absent from bundle + KNOWN
claude-fable-5-thinking-xhigh      # absent from bundle + KNOWN
claude-opus-4-8-thinking-xhigh     # absent from bundle + KNOWN
composer-2.5                       # present in bundle
composer-2.5-fast                  # present in bundle
gemini-3.1-pro                     # present in bundle
gpt-5.3-codex-xhigh-fast           # absent from bundle + KNOWN
gpt-5.4-medium                     # absent from bundle + KNOWN
gpt-5.5-high                       # absent from bundle + KNOWN
```

The only local holder of the exact current enum is the agent's own injected tool descriptor at runtime. The capture workflow exists to persist that data before the session ends.

---

## Resolution Precedence

Four tiers, highest to lowest. The first tier with a valid result for the current Cursor version wins.

| Tier | Source | Key | Location |
|------|--------|-----|----------|
| 1 | `reported[cursorVersion]` | Cursor version string | `~/.config/oh-my-cursor/reported-models.json` |
| 2 | Bundle scan | Slugs extracted from the Cursor bundle | `~/.cursor/extensions/.../...` |
| 3 | Passive observation | Slugs seen in live `Task()` calls at runtime | In-memory accumulator |
| 4 | `KNOWN_CURSOR_MODELS` | Static fallback floor | `hooks/lib/known-models.ts` |

**Tier 1** is the only source that can contain server-injected slugs absent from the bundle. It is populated by the capture workflow below.

**Tier 2** (bundle scan) catches slugs baked into the Cursor distribution but misses server-side additions. `extractSlugCluster` in `task-schema-introspector.ts` drives this scan.

**Tier 3** (passive observation) accumulates slugs seen in actual `Task()` dispatches during the current daemon session. It fills gaps between a Cursor update and the next `/sync-models` run, but only for slugs that have already been dispatched.

**Tier 4** (`KNOWN_CURSOR_MODELS`) is a static list maintained by hand. It is the floor — always available, always stale relative to the live enum.

---

## Capture Workflow

The agent runs `/sync-models` (see [`commands/sync-models.md`](../commands/sync-models.md)) while it can still read its injected tool descriptor.

```
Agent reads injected tool descriptor
  └── extracts model slug list + current Cursor version
       └── POST /reported-models  { version, models }
            └── Daemon validates slugs
                 ├── shape checks: non-empty, ≤60 chars, matches SLUG_FULL_RE, dedup, min 3
                 └── on success:
                      ├── persists to reported-models-store.ts
                      ├── invalidates base cache (invalidateBaseCache)
                      ├── calls runtime.refresh()
                      └── emits introspection-updated SSE event
                           └── Dashboard Models & Routing tab refreshes automatically
```

After a successful capture, `GET /introspection` returns the reported tier as the slug source for the current version. The `needsCapture` advisory clears.

---

## Stale-Window Limitation

After a Cursor update, the reported capture for the **old** version is still in the store. The new version has no capture yet.

Consequences:

- `needsCapture: true` is set at dispatch time
- Resolution falls back through tiers 2, 3, 4 — all of which may be missing the new server-injected slugs
- An advisory fires at dispatch time:
  - id: `"model-enum-needs-capture"`
  - priority: `"normal"`
  - message directs the agent to run `/sync-models`

The stale window lasts until the agent runs `/sync-models` in a session on the new Cursor version. There is no automatic capture — it requires an agent action. This is expected behaviour, not a bug.

The window is bounded in practice: the advisory fires on the first dispatch after an update, and a single `/sync-models` run closes it.

---

## Enforcement Flag (`enforce_allowlist`)

Config key: `model_routing.enforce_allowlist` (boolean, default `false`).

| State | Behaviour |
|-------|-----------|
| `false` (default) | Advisory passthrough. Invalid model slugs are warned but applied as-is. Dispatch is never blocked. |
| `true` | Curated agents with an out-of-allowlist model are **remapped** to the curated default (first slug of `resolveAllowedModels` for that agent). Never a hard deny. Permissive agents are unaffected. |

"Curated agent" means an agent with an entry in `AGENT_MODEL_ALLOWLIST`. Agents not in the map are always permissive regardless of this flag.

Toggle via the dashboard Models & Routing tab (hotkey 8) or directly in `~/.config/oh-my-cursor/config.jsonc`.

---

## Key Files

| File | Role |
|------|------|
| `hooks/lib/reported-models-store.ts` | Pure, never-throwing store for the reported tier. Reads/writes `reported-models.json`. |
| `hooks/lib/task-schema-introspector.ts` | `computeBase` (reported tier), `invalidateBaseCache`, `resolveCursorVersion`, `extractSlugCluster` (bundle scan). |
| `hooks/lib/introspection-runtime.ts` | `refresh()`, `needsCapture` plumbing, passive observation accumulator. |
| `hooks/daemon.ts` | `POST /reported-models` endpoint — validates and persists a capture. |
| `hooks/handlers/model-routing-mutation.ts` | Advisory emission (`model-enum-needs-capture`) and enforcement remap logic. |
| `hooks/schemas/config.ts` | `ModelRoutingSchema.enforce_allowlist` definition. |
| `scripts/config-generator.ts` | `resolveEnumForGenerator()` — reported → KNOWN fallback, synchronous, used at config generation time. |
| `commands/sync-models.md` | User-facing capture command reference. |

---

## Related Documents

- [`docs/internal/agent-model-allowlist.md`](agent-model-allowlist.md) — per-`subagent_type` curated allowlist and resolver functions.
- [`docs/internal/per-subagent-model-enum-spike.md`](per-subagent-model-enum-spike.md) — bundle inspection confirming the flat-only wire format (Verdict B).
