# Agent Model Allowlist

_Created: 2026-06-13. Internal reference for the per-`subagent_type` model validation system._

## Background

The spike in [`docs/internal/per-subagent-model-enum-spike.md`](per-subagent-model-enum-spike.md) confirmed **Verdict B (flat-only)**: the Cursor bundle encodes `model` and `subagent_type` as independent flat string fields with no static per-type model enum. There is nothing to auto-extract. The curated map in `hooks/lib/agent-model-allowlist.ts` is therefore the authoritative source of truth for which model slugs are appropriate for each agent.

---

## `AGENT_MODEL_ALLOWLIST`

Exported from `hooks/lib/agent-model-allowlist.ts`.

A `Record<string, string[]>` mapping each oh-my-cursor `subagent_type` name to the ordered list of model slugs considered valid for that agent. The list is curated by hand and updated when new Cursor model slugs are confirmed via bundle introspection.

```ts
// Illustrative shape — see the source file for the live list
export const AGENT_MODEL_ALLOWLIST: Record<string, string[]> = {
  explore:           ["composer-2-fast", "composer-2.5", "composer-2.5-fast"],
  librarian:         ["composer-2-fast", "composer-2.5", "composer-2.5-fast"],
  sisyphus:          ["claude-opus-4-7-thinking-xhigh", "claude-4.5-opus-high", ...],
  "sisyphus-junior": ["composer-2-fast", "composer-2.5", ...],
  // ...one entry per agent
};
```

`"inherit"` is **not** in any list because it is unconditionally exempt from all checks — the resolver short-circuits before consulting the map.

### Resolver functions

| Export | Signature | Purpose |
|--------|-----------|---------|
| `resolveAllowedModels` | `(agentType: string) => string[]` | Returns the allowlist for an agent, or `[]` if unknown. |
| `isModelAllowedForAgent` | `(agentType: string, model: string) => boolean` | Returns `true` if the slug is in the allowlist or equals `"inherit"`. |

---

## `modelsByAgent` on `IntrospectionSnapshot`

`IntrospectionSnapshot` (built by `hooks/lib/task-schema-introspector.ts`) carries a `modelsByAgent` field:

```ts
interface IntrospectionSnapshot {
  cursorVersion: string;
  cachedAt: string;          // ISO-8601
  slugs: string[];           // flat union from bundle extraction
  modelsByAgent: Record<string, string[]>; // allowlist filtered to slugs present in bundle
}
```

`modelsByAgent` is computed once per snapshot build by intersecting `AGENT_MODEL_ALLOWLIST` with the flat `slugs` set extracted from the bundle. It is cached per `cursorVersion` so repeated calls within the same Cursor version pay no re-scan cost.

The dashboard's Models & Routing tab reads `modelsByAgent` to populate the per-agent model dropdown, ensuring the UI only offers slugs that are both curated and confirmed present in the running Cursor version.

---

## `introspection-updated` SSE event

**Event name:** `introspection-updated`

**When it fires:** The daemon emits this event on the SSE stream whenever a bundle re-scan produces a `cursorVersion` value that differs from the previously cached version. It does not fire on every scan — only on version change.

**Payload:**

```json
{
  "cursorVersion": "3.7.36",
  "cachedAt": "2026-06-13T10:00:00.000Z"
}
```

**Consumer:** The dashboard SSE client listens for `introspection-updated` and triggers a refresh of the Models & Routing tab (hotkey 8). This keeps the per-agent dropdown and the invalid-override banner in sync with the current Cursor version without requiring a page reload.

---

## Invalid-override behaviour

When a configured `model` or `fallback_models` entry is not in the allowlist for its agent:

| Stage | Behaviour |
|-------|-----------|
| Config write-time | Warning logged to daemon stderr |
| Dispatch-time | Advisory appended to the dispatch log |
| Dashboard | Invalid-override banner shown with a one-click reset to the agent's default |
| Dispatch itself | **Not blocked.** The slug is passed through to Cursor as-is. |

`"inherit"` bypasses all of the above — it is always valid.

---

## Related documents

- [`docs/internal/per-subagent-model-enum-spike.md`](per-subagent-model-enum-spike.md) — spike findings confirming Verdict B (flat-only) and the rationale for the curated-map approach.
- [`hooks/lib/agent-model-allowlist.ts`](../../hooks/lib/agent-model-allowlist.ts) — live source of truth for the allowlist and resolver functions.
- [`hooks/lib/task-schema-introspector.ts`](../../hooks/lib/task-schema-introspector.ts) — bundle scanner that builds `IntrospectionSnapshot` including `modelsByAgent`.
