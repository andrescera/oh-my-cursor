# Subagent Dispatch Latency Research

> Model names updated to valid Cursor Task model slugs (2026-04-15); opus 4.6 migrated to 4.7, fast -> composer-2-fast (2026-04-16). Model slug inventory refreshed 2026-05-29 against 3.6.21 binary findings (see note in §Verified Model IDs).

**Date:** 2026-04-13

Research-phase notes on Cursor subagent (Task tool) dispatch and startup latency. Facts below are tagged where they come from **official Cursor documentation**, **staff or community forum posts**, **third-party projects**, or **inference** from documented behavior. This document does not include implementation recommendations or measured benchmarks (reserved for later waves).

---

## 1. Cursor Task API Internals

**Confirmed (official docs).** Subagents operate in an isolated context. The parent must supply needed information in the delegated prompt: subagents do not see prior parent chat history. ([Cursor Subagents](https://cursor.com/docs/agent/subagents))

**Confirmed (official docs).** Execution modes:

- **Foreground:** blocks the parent until the subagent completes; the result is returned when done.
- **Background:** returns immediately while the subagent continues independently.

([Cursor Subagents — Foreground vs background](https://cursor.com/docs/agent/subagents))

**Confirmed (official docs).** The `subagentStart` hook runs **before** a subagent is spawned and can allow or deny creation. ([Cursor Hooks — subagentStart](https://cursor.com/docs/hooks))

**Confirmed (official changelog).** Cursor 2.5 (2026-02-17) introduced asynchronous subagents (parent can continue while background subagents run), nested subagents (subagents may spawn child subagents), and stated that subagents now have “lower latency, better streaming feedback, and more responsive parallel execution” compared to the prior release. ([Cursor Changelog 2.5](https://www.cursor.com/changelog/2-5))

**Sources:** [Cursor Subagents](https://cursor.com/docs/agent/subagents), [Cursor Changelog 2.5](https://www.cursor.com/changelog/2-5), [Cursor Hooks](https://cursor.com/docs/hooks)

---

## 2. Documented Parameters

### Custom subagent definitions (`.cursor/agents/`)

**Confirmed (official docs).** Custom subagents are Markdown files with YAML frontmatter. Documented frontmatter fields include:

| Field | Role |
| --- | --- |
| `name` | Identifier / display name |
| `description` | Short description; influences when Agent delegates |
| `model` | `inherit`, `composer-2-fast`, or a specific model ID |
| `readonly` | When `true`, restricted writes and no state-changing shell |
| `is_background` | When `true`, subagent runs in the background without blocking the parent |

([Cursor Subagents — Custom subagents / Configuration fields](https://cursor.com/docs/agent/subagents))

### Task tool dispatch parameters (orchestration)

**Confirmed (product behavior in Cursor Agent tooling).** The parent model invokes a Task-style tool with parameters that include (non-exhaustive list captured during this research phase):

| Parameter | Summary |
| --- | --- |
| `model` | `inherit`, `composer-2-fast`, or a specific model id |
| `subagent_type` | Built-in or custom worker type (see table below) |
| `run_in_background` | Boolean controlling whether the **parent** blocks on the Task call; does not redefine the subagent’s own cold-start characteristics (see §7) |
| `readonly` | Restricts mutating tools / state-changing shell where enforced |
| `is_background` | Default background behavior alignment with custom agent definitions |
| `resume` | Agent ID to continue a prior invocation |
| `attachments` | Paths to attached media (e.g. video) for applicable flows |
| `description` | Short (typically 3–5 word) summary for the Task |

**subagent_type values** observed in orchestration and rules for this workspace include: `generalPurpose`, `explore`, `sisyphus`, `sisyphus-junior`, `hephaestus`, `atlas`, `metis`, `momus`, `prometheus`, `oracle`, `librarian`, `shell`, `coordinator-protocol`, `best-of-n-runner`, `multimodal-looker`.

**Note:** The public Subagents doc emphasizes frontmatter and behavior; it does not publish a standalone JSON schema for every Task tool argument. Treat the Task column above as **research capture** aligned with in-product usage, not a guaranteed exhaustive API contract.

**Sources:** [Cursor Subagents](https://cursor.com/docs/agent/subagents)

---

## 3. MCP Tool Inheritance

**Confirmed (official docs — FAQ).** Subagents inherit **all** tools from the parent, including MCP tools from configured servers. ([Cursor Subagents — FAQ](https://cursor.com/docs/agent/subagents))

**Third-party claim (not Cursor).** The `mcp-lazy-load` / **mcp-lazy** project states that loading many MCP tool definitions up front can consume a large fraction of the context window, including an illustrative range of **30–50% with 5–10 servers**, and advertises **90%+** token reduction via lazy loading through a proxy. These figures are **project marketing/README claims**, not independently verified here. ([mcp-lazy-load on GitHub](https://github.com/PeterCha90/mcp-lazy-load))

**Community report (staff-acknowledged).** A forum thread reports difficulty and delay before the agent “finds” and uses an MCP tool; staff described a **known issue** where the Agent sometimes does not detect available MCP tools immediately. **Inference (latency):** user-reported “exhaustive search” behavior may increase time-to-first-effective-tool; this is **not** quantified in official docs. ([Cursor Forum — MCP tool detection](https://forum.cursor.com/t/agent-has-trouble-detecting-available-mcp-tools/146486))

**Sources:** [Cursor Subagents](https://cursor.com/docs/agent/subagents), [PeterCha90/mcp-lazy-load](https://github.com/PeterCha90/mcp-lazy-load), [Cursor Forum — MCP tool detection](https://forum.cursor.com/t/agent-has-trouble-detecting-available-mcp-tools/146486)

---

## 4. Hook Lifecycle

**Confirmed (official docs).** `subagentStart` is called **before** spawning a subagent (Task tool) and can allow or deny creation. Input includes `subagent_id`, `subagent_type`, `task`, `subagent_model`, `is_parallel_worker`, and related fields. The response `permission` field must be `"allow"` to proceed or `"deny"` to block; `"ask"` is **not** supported and is treated as `"deny"`. ([Cursor Hooks — subagentStart](https://cursor.com/docs/hooks))

**Confirmed (official docs).** `subagentStop` runs after completion, error, or abort, with fields such as summary, counts, modified files, and optional follow-up messaging (subject to loop limits). ([Cursor Hooks — subagentStop](https://cursor.com/docs/hooks))[^hook-role-split]

[^hook-role-split]: Empirical v2: `subagentStart` vs `subagentStop` can fire from different extension-host roles (`agent-exec` vs `always-local`). See New-in-v2 rows **N9** and **N11** in [hooks-v1-vs-v2-claim-diff.md](./hooks-v1-vs-v2-claim-diff.md).

**Inference (engineering).** Hook commands are external processes. Any synchronous work in `subagentStart` sits on the path before spawn completes. **Not documented as a latency budget:** no official ms figures for hook overhead.

**Sources:** [Cursor Hooks](https://cursor.com/docs/hooks)

---

## 5. Parallelism Behavior

**Community observation.** A bug report states a belief that Cursor supports “up to 4 subagents running in parallel” and describes needing explicit wording (“up to 4 in parallel”) to maximize concurrency. **Speculation:** the reporter’s “maximum slots” mental model is not confirmed as a hard server-side cap in public docs. ([Cursor Forum — parallel dispatch](https://forum.cursor.com/t/subagents-dont-maximize-parallel-dispatch/152679))

**Staff reply (confirmed quote).** A Cursor team member responded: “the model decides how many sub-agents to run in parallel” and recommended specifying the desired count in instructions as the reliable workaround. ([Cursor Forum — parallel dispatch](https://forum.cursor.com/t/subagents-dont-maximize-parallel-dispatch/152679))

**Anecdotal (workspace research).** Internal testing during this phase reported **>4** concurrent Task dispatches (e.g. 8–12) without failure. **Not official:** Cursor does not publish a supported concurrency maximum for the IDE Task tool.

**Confirmed (official changelog).** 2.5 changelog cites “more responsive parallel execution” for subagents; 2.4 introduced subagents broadly. Nested subagents (tree) are **confirmed** for 2.5+. ([Cursor Changelog 2.5](https://www.cursor.com/changelog/2-5), [Cursor Changelog 2.4](https://www.cursor.com/changelog/2-4))

**Gap (official).** No published queue depth, scheduler fairness rules, or IDE-side caps for very high parallelism.

**Sources:** [Cursor Forum — parallel dispatch](https://forum.cursor.com/t/subagents-dont-maximize-parallel-dispatch/152679), [Cursor Changelog 2.5](https://www.cursor.com/changelog/2-5), [Cursor Changelog 2.4](https://www.cursor.com/changelog/2-4)

---

## 6. Rate Limits

**Community + staff (BYOK).** Users report “User Provided Rate Limit Exceeded” / high request volume with **bring-your-own-key** setups; a staff reply states that when using provider APIs directly, **rate limits can be much lower than Cursor’s** and that Cursor does not impose those provider limits on behalf of the user. ([Cursor Forum — BYOK rate limits](https://forum.cursor.com/t/user-provided-rate-limit-exceeded-in-agent-mode/36717))

**Confirmed (official docs — separate surface).** Team **REST** APIs document per-minute limits and `429 Too Many Requests` responses. These limits apply to **HTTP APIs** (Admin, Analytics, AI Code Tracking, Cloud Agents, etc.), **not** to a published “IDE Task calls per minute” table. ([Cursor API overview](https://cursor.com/docs/api))

**Inference.** Parallel subagents multiply concurrent model/tool traffic; provider TPM/RPM and Cursor routing behavior can become limiting factors. **Not documented:** a dedicated rate-limit matrix for in-IDE Task/subagent count.

**Sources:** [Cursor Forum — BYOK rate limits](https://forum.cursor.com/t/user-provided-rate-limit-exceeded-in-agent-mode/36717), [Cursor API overview](https://cursor.com/docs/api)

---

## 7. Confirmed Non-Levers

Findings below come from **this research pass** over Cursor docs, changelogs, forum threads, and public GitHub discussions relevant to Agent/Task/MCP/hooks. They are **absence-of-evidence** statements: lack of documented tuning knobs.

- No hidden `Task()` parameters surfaced in public documentation that **guarantee** faster subagent dispatch or cold start.
- No `settings.json` (or equivalent published editor settings) documented specifically for **Task dispatch tuning** or subagent pre-warm.
- `run_in_background` changes **parent blocking** on the Task call; it is **not** documented as reducing child **cold-start** latency.
- No official documentation of **pre-warming**, **connection pooling**, or **warm-start pools** dedicated to subagents.
- CLI networking options such as **`useHttp1ForAgent`** (where present in CLI configuration) target the **CLI agent**, not the desktop IDE Agent/Task pipeline—no public doc was found equating that setting to IDE subagent spawn latency.

**Label:** Operational confirmation for this section is **internal research synthesis**, not a single citable URL.

---

## Verified Model IDs

> **Refreshed 2026-05-29 (Cursor 3.6.21).** `cursor agent models` returned no output on this host (headless agent binary `~/.local/bin/agent` absent). Slug inventory below cross-checked against the model slugs visible in the Cursor Task tool's available model list at 3.6.21. Previous slugs from 2026-04-13 CLI capture noted where changed.

Models referenced by oh-my-cursor agent definitions in this repo (`agents/*.md` and orchestration rules):

| Agent | Verified model ID | Change from 2026-04-13 |
| --- | --- | --- |
| explore | `composer-2.5-fast` | renamed from `composer-2-fast` |
| librarian | `composer-2.5-fast` (Task tool parameter; selects a smaller/faster model) | renamed from `composer-2-fast` |
| sisyphus-junior | `composer-2.5-fast` | renamed from `composer-2-fast` |
| sisyphus | `claude-opus-4-8-thinking-high` | was `claude-opus-4-7-thinking-xhigh` |
| hephaestus | `gpt-5.5-high` | was `gpt-5.5-extra-high` |
| atlas | `claude-4.6-sonnet-medium-thinking` | unchanged |
| oracle | `gpt-5.4-medium` | unchanged |
| prometheus | `claude-opus-4-8-thinking-high` | was `claude-opus-4-7-thinking-xhigh` |
| metis | `gpt-5.4-medium` | unchanged |
| momus | `gpt-5.5-high` | was `gpt-5.5-extra-high` |
| multimodal-looker | `gemini-3.1-pro` | unchanged |

**Note:** `composer-2.5-fast` is a Task tool parameter (not in the `cursor agent models` list) that selects a smaller/faster model. Full available slug list at 3.6.21: `claude-4.6-sonnet-medium-thinking`, `claude-opus-4-8-thinking-high`, `composer-2.5`, `composer-2.5-fast`, `gemini-3.1-pro`, `gpt-5.3-codex-xhigh-fast`, `gpt-5.4-medium`, `gpt-5.5-high`.

---

## 8. Open Questions

These remain **unanswered in public Cursor documentation** reviewed for this note:

1. Whether `resume` reuses warm **server-side** execution state versus **conversation transcript** state only.
2. Internal **connection pooling** or **pre-warming** mechanics for agent/subagent sessions.
3. Whether **`subagent_type`** (beyond model choice and prompts) implies **different cold-start** or scheduling paths.
4. Exact **queue depth** or **scheduler** behavior for very high parallel Task counts (e.g. **>12**).
5. Whether Cursor applies **internal rate limiters** to IDE Task/subagent concurrency (distinct from provider TPM/RPM).

---

## MCP Server Audit

**Scope:** MCP servers present in the current Cursor configuration for this workspace, as reflected by on-disk tool descriptors under `<home>/.cursor/projects/mnt-development-oh-my-openagent/mcps/`. **Action:** disable duplicates in Cursor MCP settings only if you accept the trade-offs below; this note does not change any configuration.

### Per-server summary

| Server | Role | Cached tools (this workspace) | Needed? |
| --- | --- | --- | --- |
| `plugin-oh-my-cursor-websearch` | Exa web search | `web_search_exa` | **Yes** (keep one web search stack) |
| `user-websearch` | Same Exa web search | `web_search_exa` | **Redundant** if plugin copy enabled |
| `plugin-oh-my-cursor-grep_app` | grep.app GitHub code search | `searchGitHub` | **Yes** (keep one grep.app stack) |
| `user-grep_app` | Same grep.app | `searchGitHub` | **Redundant** if plugin copy enabled |
| `plugin-oh-my-cursor-context7` | Context7 docs | `query-docs`, `resolve-library-id` | **Yes** (keep one Context7 stack) |
| `user-context7` | Same Context7 | `query-docs`, `resolve-library-id` | **Redundant** if plugin copy enabled |
| `user-oh-my-cursor` | oh-my-cursor plugin MCP bundle | *(no `tools/*.json` in cache; server status errored at capture time)* | Treat as **duplicate** of plugin copy if both are wired to the same capabilities |
| `plugin-oh-my-cursor-oh-my-cursor` | oh-my-cursor (plugin-managed) | *(same — no tool JSON in cache; errored)* | **Prefer** as the managed entry when the local oh-my-cursor extension supplies MCP |
| `user-notion` | Notion | `mcp_auth` | **Yes** if you use Notion MCP; **no** overlap with rows above |
| `user-eamodio.gitlens-extension-GitKraken` | GitLens / GitKraken (git, PRs, issues, …) | 23 tools (e.g. `git_status`, `git_log_or_diff`, `pull_request_*`, `issues_*`, `gitlens_*`) | **Yes** if you rely on GitKraken/GitLens from the editor; **no** duplicate of the oh-my-cursor / web / grep / Context7 rows |

### Verified duplicate pairs (tool overlap)

Descriptors use **identical tool names and schemas** for:

- **Web search:** `plugin-oh-my-cursor-websearch` ↔ `user-websearch` — both expose `web_search_exa` with the same argument schema (plugin copy additionally tags `plugin` / `marketplace` in JSON metadata only).
- **grep.app:** `plugin-oh-my-cursor-grep_app` ↔ `user-grep_app` — both expose `searchGitHub` with matching descriptions/schemas.
- **Context7:** `plugin-oh-my-cursor-context7` ↔ `user-context7` — both expose `query-docs` and `resolve-library-id`.

**oh-my-cursor pair:** `user-oh-my-cursor` and `plugin-oh-my-cursor-oh-my-cursor` are **naming-level duplicates** (same product surface). This workspace’s cached folders contained **no** `tools/*.json` for either (only `SERVER_METADATA.json` / `STATUS.md`), and `STATUS.md` reported an MCP error — so tool-by-tool equivalence was not re-verified from files. Recommendation still follows product intent: **one** oh-my-cursor MCP connection.

### Recommendations (reduce context without losing capability)

| Pair | Keep | Disable (if redundant) |
| --- | --- | --- |
| Web search | `plugin-oh-my-cursor-websearch` | `user-websearch` |
| grep.app | `plugin-oh-my-cursor-grep_app` | `user-grep_app` |
| Context7 | `plugin-oh-my-cursor-context7` | `user-context7` |
| oh-my-cursor | `plugin-oh-my-cursor-oh-my-cursor` | `user-oh-my-cursor` |

**Caveats:** If a `user-*` server uses different env, auth, or endpoints than the plugin-managed copy, disabling it without checking those settings could drop access. Prefer comparing MCP server definitions in Cursor Settings before toggling.

### Estimated impact on tool-definition context

Illustrative order-of-magnitude (not a measured token count for this project):

- **Assumption:** ~10 MCP servers × ~5 tools each ≈ **~50** tool definitions visible to the parent and, per Cursor docs, **inherited by subagents** (see §3).
- **Removing four duplicate `user-*` servers** that mirror plugin servers ≈ **4 × ~5 ≈ ~20** fewer tool definitions ≈ **~20%** reduction in that MCP-tool surface (scales linearly if your real tool counts differ).

For **this** descriptor snapshot, the four clear duplicates contribute **at least** **1 + 1 + 2 = 4** named tools from `user-websearch`, `user-grep_app`, and `user-context7`; the oh-my-cursor pair’s contribution is unknown until the server exposes tools successfully.

---

## References

- https://cursor.com/docs/agent/subagents  
- https://www.cursor.com/changelog/2-5  
- https://www.cursor.com/changelog/2-4  
- https://cursor.com/docs/hooks  
- https://github.com/PeterCha90/mcp-lazy-load  
- https://forum.cursor.com/t/agent-has-trouble-detecting-available-mcp-tools/146486  
- https://forum.cursor.com/t/subagents-dont-maximize-parallel-dispatch/152679  
- https://forum.cursor.com/t/user-provided-rate-limit-exceeded-in-agent-mode/36717  
- https://cursor.com/docs/api  
