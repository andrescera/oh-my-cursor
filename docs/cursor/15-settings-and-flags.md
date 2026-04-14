# Settings & Feature Flags

> Cursor 3.0.16. Evidence tags per claim.

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

## See also

- [Extension API](14-extension-api.md) — `vscode.d.ts` additions vs internal namespaces.
- [Binary Analysis](16-binary-analysis.md) — full `product.json` and bundle-derived lists.
