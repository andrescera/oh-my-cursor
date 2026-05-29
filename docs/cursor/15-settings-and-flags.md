# Settings & Feature Flags

> Cursor 3.6.21 (cursor-bin 3.6.21-1, vscodeVersion 1.105.1, commit e7a7e93f4d75f8272503ecf33cedbaae10114a10). Evidence tags per claim. Re-audited 2026-05-29; claims carry per-claim `last-verified` markers — unmarked claims retain their 3.0.16 baseline and were not re-verified at 3.6.21.

This page groups **documented settings**, **locally observed keys**, **Statsig / build metadata from shipped binaries**, and **update channels**. Items sourced from binaries are **[binary-only]** — they are **not** stable APIs and may change every build.

---

## Official `cursor.*` settings [official-doc]

| Key | Role (high level) |
|-----|-------------------|
| `cursor.agent_layout_browser_beta_setting` | Agent layout / in-IDE browser beta (exact UX depends on Cursor version and rollout). |
| `cursor.composer.shouldChimeAfterChatFinishes` | Play a chime when a chat / composer turn finishes. |
| `cursor.general.disableHttp2` | Disable HTTP/2 for applicable client traffic (troubleshooting / networking). |

Confirm names, defaults, and scopes in **Cursor Settings** or current [Cursor documentation](https://cursor.com/docs); this table is a pointer, not a schema.

---

## Discovered settings [repro-local]

These keys appear in **local configuration or bundles** on some installs. **Effect and support are not guaranteed** — verify in your build before relying on them.

| Key / surface | Notes |
|---------------|--------|
| `cursor.composer.shouldAllowCustomModes` | Seen in local settings history; purpose/effect **unknown**. See [Modes & Switching](01-modes-and-switching.md). |
| `cursor.agentIdeUnification.enabled` | Appears in **when** clauses (e.g. `keybindings.json`) tied to agent–IDE unification / Glass-style UI. |
| `composerMode.agent` | Keybinding **command** id used to open or focus agent/composer mode (not a boolean setting). |

---

## Feature flags (Statsig) [binary-only]

Cursor integrates **Statsig** for experiments and dynamic configuration. In **`product.json`** from a local 3.0.16 install:

- **`statsigLogEventProxyUrl`** — telemetry / event proxy endpoint (e.g. Statsig-related traffic).
- **`statsigClientKey`** — client key material is present in **`product.json`**; values are **omitted from this repo’s docs** (do not publish keys).

Dynamic **config names** and **gate strings** also appear in the **workbench bundle** (minified). Those names are **internal**, **unstable**, and differ between builds. Treat any extracted gate list as **diagnostic only**, not a product contract. See **Feature Flags (Statsig)** in [Binary Analysis](16-binary-analysis.md).

---

## Build flags [binary-only]

`product.json` includes **`removeLinesBeforeCompilingIfTheyContainTheseWords`**: compile-time markers; lines containing these tokens are stripped before shipping. Each fragment maps to an **internal capability area** (mostly dev / nightly tooling removed from stable).

**Subset called out for integration research** (token suffixes as embedded in the array entries):

| Internal marker (concept) | Inferred area |
|---------------------------|---------------|
| `disable_composer_handle_debugging__` | Composer debugging hooks |
| `disable_shadow_workspace_debugging__` | Shadow workspace debugging |
| `disable_ai_debugger__` | AI debugger |
| `disable_statsig__` | Statsig client paths in dev |
| `disable_user_intent_agents__` | User-intent agent plumbing |
| `disable_kill_all_modes_and_surface_bg__` | Mode / background-surface controls |
| `disable_resume__` | Conversation resume |
| `disable_rcp_server__` | RCP server |
| `disable_agent_cli_formatter__` | Agent CLI formatting |
| `allow_skip_privacy_mode_grace_period__` | Privacy-mode grace period (dev-only behavior) |

The **full array** (41 entries) and broader categorization are in [Binary Analysis](16-binary-analysis.md) (`removeLinesBeforeCompilingIfTheyContainTheseWords`).

---

## Update channels [official-doc]

| Channel | Notes |
|---------|--------|
| **Default** | Stable release track. |
| **Early Access** | Pre-stable access; in **3.x** material, Early Access is often **consolidated behind Nightly** — follow in-app copy and changelog for the exact menu names on your version. |
| **Nightly** | Fastest-moving builds; highest breakage risk. |

---

## Additional `cursor.*` keys (binary inventory) [repro-local]

The following are **additional** configuration-related keys observed in **`cursor.*` string analysis** (not an exhaustive settings schema). See **Settings Keys** in [Binary Analysis](16-binary-analysis.md) for types and purpose notes.

`cursor.composer.subagentModel`, `cursor.composer.suggestNextPrompt`, `cursor.composer.customChimeSoundPath`, `cursor.composer.textSizeScale`, `cursor.composer.planTextSizeScale`, `cursor.composer.usageSummaryDisplay`, `cursor.composer.queueMessageDefaultBehavior`, `cursor.composer.shouldAutoSaveNonAgent`, `cursor.cpp.disabledLanguages`, `cursor.cpp.enablePartialAccepts`, `cursor.general.enableShadowWorkspace`, `cursor.general.gitGraphIndexing`, `cursor.general.emailPrivacyEnabled`, `cursor.general.globalCursorIgnoreList`, `cursor.general.reduceTransparency`, `cursor.terminal.enableAiChecks`, `cursor.terminal.usePreviewBox`, `cursor.inlineDiff.enablePerformanceProtection`, `cursor.chat.smoothStreaming`, `cursor.chatMaxWidth`, `cursor.chatEditorGroup.enabled`, `cursor.worktreeMaxCount`, `cursor.worktreeCleanupIntervalHours`, `cursor.worktreesSetup`, `cursor.hooks`, `cursor.hooks.initializeUserHooks`, `cursor.rpcFileLogger.enabled`, `cursor.rpcFileLogger.folder`, `cursor.debug.timeoutPrevention`, `cursor.remote.isSSH`, `cursor.featureStatus.dataPrivacyOnboarding`, `cursor.rules.convertLegacyAgentAppliedRules`, `cursor.blame.hoverDelay`, `cursor.semanticSearch.includeCommitsWithFiles`, `cursor.localParallelAgentsDisableRecommender`.

Agent–IDE / Glass-related keys (e.g. `cursor.agentIdeUnification.*`, `cursor.glass.*`) are listed under **Commands (`cursor.*`)** in [Binary Analysis](16-binary-analysis.md).

---

## oh-my-cursor

**Programmatic settings usage:** not a focus of this plugin today (no runtime reads/writes of the above keys from hooks or MCP).

**Could use:** `cursor.composer.shouldAllowCustomModes` — *if* it enables custom composer modes in a future build, it could align with **orchestrator-defined mode workflows**; **unverified** — treat as experimental until confirmed in [official-doc] or [repro-local] on your install.

---

## Cursor 3.1 → 3.6 changes

> **last-verified: 3.6.21** — Re-audited 2026-05-29. New settings and flags introduced between Cursor 3.1 (Apr 13, 2026) and 3.6.21 (binary date 2026-05-28). Evidence tags follow the same convention as the rest of this page. Source: `docs/internal/reaudit-3621/binary-facts-3621.md` and `docs/internal/reaudit-3621/feature-discovery-3.1-3.6.md`. <!-- last-verified: 3.6.21 -->

### SF-01 · `disable_local_mode` — New Compile-Time Strip [binary-only]

- **What:** `__GULPFILE_REMOVE_LINE_BEFORE_COMPILING____disable_local_mode__` is the **42nd entry** in `removeLinesBeforeCompilingIfTheyContainTheseWords` (up from 41 entries at 3.0.16). Signals a "local mode" execution path that can be compile-time stripped from stable builds.
- **Inferred area:** Enterprise local-vs-cloud agent routing — when stripped, forces all execution through cloud paths.
- **Version:** unknown (present at 3.6.21; no changelog entry as of 2026-05-29)
- **Evidence:** `[binary-only]`

### SF-02 · Model Access Controls (Enterprise) [official-doc]

- **What:** Granular provider-level and model-level allow/block lists for admins. Admins can:
  - Block entire providers or specific model configs (by speed tier or context-window size).
  - Enable "block new providers/model versions by default" to lock the allowed surface going forward.
  - **Migration deadline:** existing blocklists must be migrated by **June 1, 2026**.
- **Version:** May 4, 2026
- **Evidence:** `[official-doc]`

### SF-03 · Soft Spend Limits with Usage Alerts [official-doc]

- **What:** Admins can configure soft spend limits (non-blocking) instead of hard cutoffs. Automatic alert emails are sent to affected users at **50%, 80%, and 100%** of the configured threshold.
- **Version:** May 4, 2026
- **Evidence:** `[official-doc]`

### SF-04 · Compact Chat Response Density [official-doc]

- **What:** New per-user "tool call density" setting controlling how much agent tool activity is surfaced per response. Three modes:
  - **Compact** — minimal tool-call detail shown inline.
  - **Balanced** — moderate tool-call detail (default).
  - **Detailed** — full tool activity expanded by default.
- **Setting key (binary):** `cursor.composer.usageSummaryDisplay` (see binary inventory above).
- **Version:** 3.4 (May 13, 2026)
- **Evidence:** `[official-doc]`

### SF-05 · Explore Subagent Model Setting [official-doc]

- **What:** New setting to control the model used by Explore subagents, independent of the parent agent model. Options:
  - Choose a **specific model** for all Explore subagents.
  - **Inherit** the parent agent's current model.
  - **Disable** Explore subagents entirely.
  - General model names (e.g. `opus`) always resolve to the newest model in that family.
- **Setting key (binary):** `cursor.composer.subagentModel` (see binary inventory above).
- **Version:** 3.3 (May 7, 2026)
- **Evidence:** `[official-doc]`

---

## See also

- [Extension API](14-extension-api.md) — `vscode.d.ts` additions vs internal namespaces.
- [Binary Analysis](16-binary-analysis.md) — full `product.json` and bundle-derived lists.
