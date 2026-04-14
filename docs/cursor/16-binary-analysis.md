# Binary Analysis

> Cursor 3.0.16 (cursor-bin 3.0.16-1, vscodeVersion 1.105.1). All findings tagged [repro-local].
> Items here are observed in the binary and MUST NOT be treated as stable user-facing features.

---

## Methodology

**Environment:** Linux (arch), Cursor installed at `/usr/share/cursor/resources/app/`  
**Build date:** 2026-04-09T05:33:51.767Z  
**Commit:** `475871d112608994deb2e3065dfb7c6b0baa0c50`  
**Real commit:** `475871d112608994deb2e3065dfb7c6b0baa0c54`  
**Analysis date:** 2026-04-14

### Steps

1. **node_modules.asar inspection** — File is an empty archive (`{"files":{}}`, 28 bytes). Actual modules live in the uncompressed `node_modules/` directory alongside it. `@electron/asar` was used to verify the archive structure.
2. **Module inventory** — `ls -1 /usr/share/cursor/resources/app/node_modules/` enumerated 334 top-level entries (scoped + unscoped).
3. **product.json analysis** — `python3 -c "import json"` parsed the 57 KB product.json for all keys.
4. **workbench.desktop.main.js analysis** — `rg` (ripgrep) against the 56 MB minified bundle for string patterns, object keys, URL literals, and handler path fragments.
5. **vscode.d.ts inspection** — `grep` against the 21 038-line type declaration file for Cursor-specific exports.

---

## Node Module Inventory

**Total top-level packages:** 334 directories (scoped + unscoped)

### Cursor / Anysphere-specific scoped packages [repro-local]

| Package | Description |
|---------|-------------|
| `@anysphere/policy-watcher` | Likely enforces enterprise/org policy rules |
| `@apm-js-collab/code-transformer` | Code transformation (possibly diff/edit application) |
| `@apm-js-collab/tracing-hooks` | Tracing infrastructure hooks |

### Notable non-standard packages [repro-local]

These are not standard VS Code or Electron packages; their presence reveals capabilities:

| Package | Capability implication |
|---------|----------------------|
| `cursor-proclist` | Native process listing (likely for terminal/agent shell monitoring) |
| `@novnc/novnc` | VNC display — remote desktop / computer-use rendering |
| `@prisma/…` | Prisma ORM — local structured data persistence |
| `@bufbuild/protobuf` + `@connectrpc/connect` + `@connectrpc/connect-node` | gRPC/Connect-RPC protocol for AI server communication |
| `@tanstack/query-core` + `@tanstack/react-query` + `@tanstack/solid-query` | Data-fetching/caching layer (UI state management) |
| `@typespec/ts-http-runtime` | TypeSpec HTTP runtime — auto-generated API client |
| `chrome-remote-interface` | Chrome DevTools Protocol — browser automation |
| `cockatiel` | Resilience library (circuit breakers, retry, timeout) |
| `@sentry` + `@sentry-internal` | Crash reporting / session recording |
| `@jimp` + `jimp` | Image processing (computer-use screenshot manipulation) |
| `@opentelemetry/…` | Distributed tracing |
| `@dnd-kit/…` | Drag-and-drop UI (agent panels, diff views) |
| `@tokenizer/token` | Token counting for context window management |

### Standard packages (VS Code / Electron ecosystem)

`@azure/*`, `@microsoft/*`, `@vscode/*`, `@xterm/*`, `@types/*`, `@parcel/*` — inherited from VS Code upstream.

---

## product.json — Build Flags

### Identity [repro-local]

| Key | Value |
|-----|-------|
| `version` | `3.0.16` |
| `vscodeVersion` | `1.105.1` |
| `commit` | `475871d112608994deb2e3065dfb7c6b0baa0c50` |
| `realCommit` | `475871d112608994deb2e3065dfb7c6b0baa0c54` (note: last char differs) |
| `date` | `2026-04-09T05:33:51.767Z` |
| `quality` | `stable` |
| `applicationName` | `cursor` |
| `serverApplicationName` | `cursor-server` |
| `dataFolderName` | `.cursor` |
| `darwinBundleIdentifier` | `com.todesktop.230313mzl4w4u92` |
| `win32AppUserModelId` | `Anysphere.Cursor` |
| `linuxIconName` | `co.anysphere.cursor` |
| `urlProtocol` | `cursor` |

### Telemetry [repro-local]

| Key | Value |
|-----|-------|
| `enableTelemetry` | `true` |
| `removeTelemetryMachineId` | `true` |
| `enabledTelemetryLevels.error` | `true` |
| `enabledTelemetryLevels.usage` | `true` |
| `simulateProdOnDev` | `false` |
| `statsigLogEventProxyUrl` | `https://api3.cursor.sh/tev1/v1` |

> Note: `statsigClientKey` is present in product.json but intentionally omitted from this document per the analysis constraints.

### Cursor-specific auth [repro-local]

`cursorTrustedExtensionAuthAccess` grants auth access to:
- `anysphere.cursor-retrieval`
- `anysphere.cursor-commits`

### Extension restrictions [repro-local]

`cannotImportExtensions`:
- `github.copilot-chat`
- `github.copilot`
- `ms-vscode.remote-explorer`

`skipPackagingLocalExtensions`:
- `cursor-context-ast-typescript`

`extensionReplacementMapForImports` — maps imports from:
`ms-vscode-remote.remote-ssh`, `ms-vscode-remote.remote-containers`, `ms-vscode-remote.remote-wsl`, `jeanp413.open-remote-ssh`, `jeanp413.open-remote-wsl`, `ms-python.vscode-pylance`, `ms-vscode.cpptools`, `ms-dotnettools.csharp`

### File checksums [repro-local]

| File | SHA-256 (base64) |
|------|-----------------|
| `vs/workbench/workbench.desktop.main.js` | `oslZMHp29tLjQ0JOLR7bMBq+q7PNg1f3A3Y3ZVLJvIg` |
| `vs/code/electron-sandbox/workbench/workbench.html` | `E6RG2gbwOjtPjaYkC1efQqCWiKpnCZMWMfP5HSPG4/A` |
| `vs/base/parts/sandbox/electron-sandbox/preload.js` | `a2wyuvLuF/KaIMb1CBWByRWQFNsEqYWE4otiQ3iMw/Q` |

### `removeLinesBeforeCompilingIfTheyContainTheseWords` — Full array [repro-local]

This array controls which code lines are stripped before bundling for production. Each entry names a compile-time capability that is **removed** in stable builds. These strings map directly to internal feature areas.

```
__GULPFILE_REMOVE_LINE_BEFORE_COMPILING____EXTENSION_IS_DEV__
__GULPFILE_REMOVE_LINE_BEFORE_COMPILING____disable_development_tooling__
__GULPFILE_REMOVE_LINE_BEFORE_COMPILING____disable_separate_product_json_for_remote_ssh__
__GULPFILE_REMOVE_LINE_BEFORE_COMPILING____disable_composer_handle_debugging__
__GULPFILE_REMOVE_LINE_BEFORE_COMPILING____disable_backend_selection_keyboard_shortcuts__
__GULPFILE_REMOVE_LINE_BEFORE_COMPILING____remove_to_default_use_prod_backend__
__GULPFILE_REMOVE_LINE_BEFORE_COMPILING____disable_console_log__
__GULPFILE_REMOVE_LINE_BEFORE_COMPILING____disable_cpp_control_token__
__GULPFILE_REMOVE_LINE_BEFORE_COMPILING____disable_cursoreval__
__GULPFILE_REMOVE_LINE_BEFORE_COMPILING____disable_ai_assert__
__GULPFILE_REMOVE_LINE_BEFORE_COMPILING____dont_print_all_stack_traces_when_listener_leak__
__GULPFILE_REMOVE_LINE_BEFORE_COMPILING____disable_cpp_this_is_set_in_prod_and_nightly__
__GULPFILE_REMOVE_LINE_BEFORE_COMPILING____disable_ai_debugger__
__GULPFILE_REMOVE_LINE_BEFORE_COMPILING____disable_shadow_workspace_debugging__
__GULPFILE_REMOVE_LINE_BEFORE_COMPILING____disable_context_ast_typescript_fork__
__GULPFILE_REMOVE_LINE_BEFORE_COMPILING____disable_cpp_eval__
__GULPFILE_REMOVE_LINE_BEFORE_COMPILING____disable_dev_flush_logs__
__GULPFILE_REMOVE_LINE_BEFORE_COMPILING____disable_multi_file_applies__
__GULPFILE_REMOVE_LINE_BEFORE_COMPILING____disable_embedding_model_switch__
__GULPFILE_REMOVE_LINE_BEFORE_COMPILING____disable_cursor_prediction_options__
__GULPFILE_REMOVE_LINE_BEFORE_COMPILING____disable_ttft_logging__
__GULPFILE_REMOVE_LINE_BEFORE_COMPILING____disable_always_on_fast_apply_chunk_speculation__
__GULPFILE_REMOVE_LINE_BEFORE_COMPILING____disable_runnable_code_blocks__
__GULPFILE_REMOVE_LINE_BEFORE_COMPILING____disable_auto_import_experiments__
__GULPFILE_REMOVE_LINE_BEFORE_COMPILING____disable_warning_on_too_many_update_locks__
__GULPFILE_REMOVE_LINE_BEFORE_COMPILING____disable_dev_only_prompt_quality_link__
__GULPFILE_REMOVE_LINE_BEFORE_COMPILING____disable_menubar_debugging__
__GULPFILE_REMOVE_LINE_BEFORE_COMPILING____disable_multiple_embeddings__
__GULPFILE_REMOVE_LINE_BEFORE_COMPILING____disable_hmr__
__GULPFILE_REMOVE_LINE_BEFORE_COMPILING____disable_resume__
__GULPFILE_REMOVE_LINE_BEFORE_COMPILING____disable_console_error__
__GULPFILE_REMOVE_LINE_BEFORE_COMPILING____disable_composer_migration_warning__
__GULPFILE_REMOVE_LINE_BEFORE_COMPILING____disable_rcp_server__
__GULPFILE_REMOVE_LINE_BEFORE_COMPILING____disable_agent_cli_formatter__
__GULPFILE_REMOVE_LINE_BEFORE_COMPILING____disable_performance_events__
__GULPFILE_REMOVE_LINE_BEFORE_COMPILING____allow_skip_privacy_mode_grace_period__
__GULPFILE_REMOVE_LINE_BEFORE_COMPILING____disable_kill_all_modes_and_surface_bg__
__GULPFILE_REMOVE_LINE_BEFORE_COMPILING____disable_statsig__
__GULPFILE_REMOVE_LINE_BEFORE_COMPILING____disable_dev_backend_and_login_argv_args__
__GULPFILE_REMOVE_LINE_BEFORE_COMPILING____disable_fill_screen__
__GULPFILE_REMOVE_LINE_BEFORE_COMPILING____disable_user_intent_agents__
```

**Capability areas inferred** (41 entries, stable build removes all of these debugging paths):

- **Debugging hooks**: composer debugging, AI debugger, shadow workspace debugging, menubar debugging, CPP control token, CPP eval, AI assert
- **Dev tooling**: development tooling, console.log, console.error, dev flush logs, dev backend/login argv args, prompt quality link, HMR, cursoreval
- **Dev-only features**: EXTENSION_IS_DEV, separate product.json for remote SSH, backend selection keyboard shortcuts, default prod backend override
- **AI features (experimental)**: multi-file applies, embedding model switch, cursor prediction options, always-on fast apply chunk speculation, runnable code blocks, auto import experiments, multiple embeddings
- **System features**: resume (conversation resume), RCP server, agent CLI formatter, performance events, statsig (disabled in dev), user intent agents, kill all modes and surface background, fill screen
- **Privacy**: allow skip privacy mode grace period
- **Migration**: composer migration warning

---

## workbench.desktop.main.js String Analysis

File: `/usr/share/cursor/resources/app/out/vs/workbench/workbench.desktop.main.js`  
Size: **56,451,489 bytes** (~56 MB, minified)

### Mode Switching [repro-local]

The `composerModesService` manages all composer modes. Mode is stored as a string called `getComposerUnifiedMode`.

**Observed mode string values** (by frequency in bundle):

| Mode | Occurrences | Description |
|------|------------|-------------|
| `"background"` | 462 | Background agent / Glass mode composer |
| `"normal"` | 293 | Normal chat/composer (non-agent) |
| `"agent"` | 240 | Agent mode (standard) |
| `"debug"` | 168 | Debug mode (AI debugger) |
| `"plan"` | 126 | Plan mode |
| `"project"` | 111 | Project mode |
| `"chat"` | 111 | Chat mode (non-agentic) |
| `"edit"` | 49 | Inline edit / CMD-K |
| `"spec"` | 16 | Spec mode |

**composerModesService public API** (observed method names):
- `getAllModes` — enumerate all registered modes
- `getComposerUnifiedMode(composerId)` — current mode for a composer
- `setComposerUnifiedMode(composerId, mode)` — set mode
- `getMode(modeId)` — get mode descriptor
- `getModeDescription(modeId)`
- `getModeAutoRun(modeId)` / `setModeAutoRun(modeId, value)` — per-mode auto-run setting
- `getModeFullAutoRun(modeId)` / `setModeFullAutoRun(modeId, value)` — full auto-run (unrestricted)
- `getModeThinkingLevel(modeId)` / `setModeThinkingLevel(modeId, level)` — per-mode thinking level
- `getComposerAutoRun()` / `setComposerAutoRun(value)` — agent mode auto-run shorthand
- `getComposerFullAutoRun()` / `setComposerFullAutoRun(value)` — agent mode full auto-run shorthand
- `updateModeSetStore()` — persist mode state

**Auto-run permission levels** (observed string values):

| Value | Meaning |
|-------|---------|
| `"unrestricted"` | Full auto-run, no confirmations (YOLO mode) |
| `"allowlist"` | Auto-run only for allow-listed commands/tools |
| (empty/false) | Manual approval required |

**Thinking level** observed as `thinkingLevel` property, with at least `"none"` as a concrete value. The property propagates through `getModeThinkingLevel` / `setModeThinkingLevel`.

**Mode switch details:**  
The `switchMode` tool call handler is at `toolCallHandlers/switchMode/`. The AI can programmatically switch the composer mode. The `SwitchMode` tool sends a `switch_mode_params` / `switch_mode_result` payload. Context:

```
targetModeId ?? "",
u = t.getComposerUnifiedMode(o) || "agent",
d = n.args?.explanation,
m = new dit({fromModeId: u, toModeId: ...})
```

### Feature Flags (Statsig) [repro-local]

Cursor uses Statsig for A/B experiments and feature gates. Config names are string-keyed `*_config` objects with `fallbackValues`.

**Observed Statsig dynamic config names** (partial list):

```
abort_controller_logging_config     agent_telemetry_config
agent_url_config                    allowlist_config
auto_context_config                 auto_spillover_ui_config
background_composer_config          background_composer_model_config
browser_default_url_config          bugbot_config
cc_override_models_config           chat_config
client_tracing_config               cmd_k_model_config
codebase_telemetry_config           composer_hang_detection_config
composer_model_config               continuation_config
debug_mode_config                   debug_mode_ui_instructions_config
debug_server_config                 deep_search_model_config
default_port_config                 editor_bugbot_config
env_config                          giant_json_parse_config / giant_json_stringify_config
git_config                          git_indexing_config
glass_per_app_tabs_config           grind_mode_config
hooks_config                        import_prediction_config
indexing_config                     inline_diff_performance_config
interaction_config                  is_default_max_config / is_default_non_max_config
mcp_wake_probe_config               memory_monitor_config / memory_monitor_user_toast_config
meta_agent_config                   metrics_config / modal_display_config
model_config                        nal_stall_detector_timeout_config
named_models_view_config            new_conversation_ux_config
notebook_search_config              onboarding_config / online_metrics_config
performance_events_config           persist_config
plan_execution_model_config         pod_config / profiling_config
quick_agent_model_config            reset_skip_user_config
retry_interceptor_params_config     routed_model_view_config
run_terminal_server_config          sentry_session_recording_config
spec_model_config                   ssh_config / sshd_config
statsig_dummy_gauge_config          suggestion_hint_config
switch_mode_tool_config             switch_to_model_slug_config
synthesis_subagent_config           team_config / terminal_tip_config
tool_limits_config                  trace_config / update_config
update_layout_config                update_prompt_config
use_scm_egress_config               webhook_config
```

**Observed Statsig experiment / gate names:**
- `agent_backend_ab_test_1` / `agent_backend_ab_test_2` — backend routing A/B
- `background_agent_judge_config` — judge config for best-of-N evaluation
- `show_background_agent_disclaimer` — gate for disclaimer UI
- `hide_worktrees` — worktree feature visibility gate
- `internal_multi_repo_experiment` — multi-repo indexing experiment
- `env_setup` — environment setup config (orientation model: `gpt-5-mini`, plan model: `gpt-5`)

**Observed model references in statsig config fallback values:**
- `gpt-5-mini` (orientation model)
- `gpt-5` (plan model)
- `gpt-5-high` (judge model)
- `gpt-5.2-codex-high` / `claude-4.5-opus-high-thinking` (best-of-N models)
- `claude-4.5-opus-high` / `gpt-5.1-codex` (cmd-k default model pool)

### Commands (`cursor.*`) [repro-local]

198 unique `cursor.*` strings observed. Representative selection organized by subsystem:

**Agent / Composer:**
```
cursor.aichat                           cursor.aisettings
cursor.backgroundcomposer               cursor.closeAgentChangesEditor
cursor.composer                         cursor.composer.customChimeSoundPath
cursor.composer.planTextSizeScale       cursor.composer.queueMessageDefaultBehavior
cursor.composer.shouldAutoSaveNonAgent  cursor.composer.shouldChimeAfterChatFinishes
cursor.composer.subagentModel           cursor.composer.suggestNextPrompt
cursor.composer.textSizeScale           cursor.composer.usageSummaryDisplay
cursor.cycleComposerLocation            cursor.openAgentChangesEditor
cursor.openCursorSettings               cursor.reviewchanges
cursor.tinderdiffeditor
```

**Agent-IDE Unification (Glass mode):**
```
cursor.agentIdeUnification.agentsSurfaceVisible
cursor.agentIdeUnification.enabled
cursor.agentIdeUnification.sidebarLocation
cursor.agentIdeUnification.unifiedSidebarVisible
cursor.toggleAgentWindowIDEUnification
cursor.glassEnableOpenAgentInWindow
cursor.glassModeAvailable
cursor.glass.enrolled
cursor.glass.releaseTrackFrozen
cursor.glass.previousReleaseTrack
cursor.openGlassModeWindow
cursor.openOrFocusGlassWindow
cursor.switchToGlassWindow
cursor.glassCloseWindow / cursor.glassMaximizeWindow / cursor.glassMinimizeWindow / cursor.glassUnmaximizeWindow
cursor.hasOpenGlassWindow / cursor.hasOtherMainWindow
cursor.glassCommandsVisible
cursor.noTitlebarLayout.enabled
```

**Browser automation:**
```
cursor.browserAutomation.captureWebviewScreenshot
cursor.browserAutomation.internal.captureScreenshot
cursor.browserAutomation.internal.navigateWebview
cursor.browserAutomation.requestSnapshotBackfill
cursor.browserOriginAllowlist.ensureNavigationAllowed
cursor.browserOriginAllowlist.ensurePageOriginAllowed
cursor.browserTabEnabled
cursor.browserView.closeTab / cursor.browserView.newTab / cursor.browserView.newHeadlessTab
cursor.browserView.navigate / cursor.browserView.goBack / cursor.browserView.goForward
cursor.browserView.takeScreenshot / cursor.browserView.updateScreenshot
cursor.browserView.executeJavaScript / cursor.browserView.sendCDPCommand
cursor.browserView.getConsoleLogs / cursor.browserView.getNetworkRequests
cursor.browserView.focusOrShowTab / cursor.browserView.selectTab / cursor.browserView.hideTab
cursor.browserView.isHeadless / cursor.browserView.isLocked / cursor.browserView.setLocked
cursor.browserView.getRecordingType / cursor.browserView.setRecordingType
cursor.browserView.listTabs / cursor.browserView.reload / cursor.browserView.resize
cursor.browserView.getTitle / cursor.browserView.getURL
cursor.browserView.configureDialogHandling
```

**CPP (Cursor Tab / autocomplete):**
```
cursor.acceptcppsuggestion          cursor.acceptcppsuggestionpartial
cursor.cpp.disabledLanguages        cursor.cpp.enablePartialAccepts
cursor.fullcppsuggestion            cursor.peekcppsuggestion
cursor.rejectcppsuggestion          cursor.revertcppsuggestion
cursor.suggestcpp
```

**Shadow workspace / indexing:**
```
cursor.general.enableShadowWorkspace
cursor.general.gitGraphIndexing
cursor.semanticSearch.includeCommitsWithFiles
cursor.checkOkToIndexLink
cursor.codebaseTelemetry.triggerSnapshot
```

**Worktrees:**
```
cursor.worktreeCleanupIntervalHours
cursor.worktreeMaxCount
cursor.worktreesSetup
```

**Hooks:**
```
cursor.hooks
cursor.hooks.initializeUserHooks
```

**Bugbot:**
```
cursor.bugbot
cursor.openBugbotPane
cursor.runEditorBugbot
```

**Rules:**
```
cursor.createRuleFromSelection
cursor.openCreatedRule
cursor.rules.convertLegacyAgentAppliedRules
```

**Glass / UI:**
```
cursor.appLayout
cursor.applyLayoutStorageData
cursor.dumpLayoutStorageData
cursor.defaultSidebarLocation
cursor.chatEditorGroup.enabled
cursor.chatMaxWidth
cursor.chat.smoothStreaming
cursor.mentionLinkToolbar
cursor.titlebar.chatMaximizedMoreActions
cursor.titlebar.upgradeToPro
cursor.windowSwitcher.sidebarHoverCollapsed
cursor.openSectionHeadersQuickPick
cursor.openSolidCustomRenderQuickPick
```

**Misc:**
```
cursor.blame / cursor.blame.hoverDelay / cursor.fileblame
cursor.generateGitCommitMessage
cursor.installCli
cursor.openCursorWebsite / cursor.newdocs / cursor.giveFeedback
cursor.startOnboarding / cursor.onboarding.showing
cursor.showSubscriptionTiersModal
cursor.showTooltipActionId
cursor.openBranchMenu
cursor.openYearInReview
cursor.rpcFileLogger.enabled / cursor.rpcFileLogger.folder
cursor.publicLogCapture
cursor.removevim
cursor.dev.toggleDebugTabs
cursor.devTools.killProcess
cursor.selectBackend
cursor.useLocalhostUpdateServer
cursor.ndjsonIngest.start
cursor.personalenvironmentjson
cursor.skills.recentlyUsed
cursor.subagents.recentlyUsed
cursor.localParallelAgentsDisableRecommender
cursor.memorymonitor.* (heapLimitMB, jsHeapUsedMB, thresholdPercent, url, description)
cursor.memory.leak.* (stackKey, type)
cursor.debuggingData.* (jsHeapUsedMB, url)
cursor.debug.timeoutPrevention
cursor.configureDebugTimeout
cursor.doupdate / cursor.checkonupdate
cursor.remote.authority / cursor.remote.isRemote / cursor.remote.isSSH
cursor.remote.performance.reading
cursor.general.emailPrivacyEnabled
cursor.general.glassShowWarningNotifications
cursor.general.globalCursorIgnoreList
cursor.general.leakDetectionEnabled
cursor.general.pinnedTitleActions
cursor.general.reduceTransparency
cursor.inlineDiff.enablePerformanceProtection
cursor.editor.IInlineMultiDiffEditor
cursor.featureStatus.dataPrivacyOnboarding
cursor.billingBanner.paymentFailedDismissed
cursor.billingBanner.pendingCancellationDismissed
cursor.creditGrantPrimaryDismissedPromos
cursor.dismissedCreditGrantIds
cursor.recentlyUsed.globalOrder
cursor.commands.globalCommands / cursor.commands.recentlyUsed
cursor.action.startTrackingRequest
cursor.agentStreamMetadata
cursor.eventType
cursor.modelopened
cursor.textModel.* (buildSlug, isForSimpleWidget, isLargeFile, languageId, lineCount,
                    scheme, sessionId, skipLSPRegistration, skipLSPSync, stackKey, textLength, uri)
cursor.update.events / cursor.update.sendAuthHeaders
cursor.updateGlassMacWindowControlsHeight / cursor.updateGlassWindowsWindowControls
cursor.preferNotificationsSameAsChat
cursor.codeActions.latency / cursor.codeActions.slowCount
```

### Settings Keys [repro-local]

Notable user-facing configuration keys (subset from 198 observed `cursor.*` strings, filtered for settings semantics):

| Key | Type / Purpose |
|-----|---------------|
| `cursor.composer.subagentModel` | Model override for sub-agents |
| `cursor.composer.suggestNextPrompt` | Enable next-prompt suggestions |
| `cursor.composer.shouldChimeAfterChatFinishes` | Audio notification on completion |
| `cursor.composer.customChimeSoundPath` | Path to custom chime WAV |
| `cursor.composer.textSizeScale` | Font size scale in composer |
| `cursor.composer.planTextSizeScale` | Font size scale in plan view |
| `cursor.composer.usageSummaryDisplay` | Usage stats display mode |
| `cursor.composer.queueMessageDefaultBehavior` | Queued message handling |
| `cursor.composer.shouldAutoSaveNonAgent` | Auto-save non-agent sessions |
| `cursor.cpp.disabledLanguages` | Languages excluded from Tab autocomplete |
| `cursor.cpp.enablePartialAccepts` | Enable partial suggestion accepts |
| `cursor.general.enableShadowWorkspace` | Shadow workspace feature toggle |
| `cursor.general.gitGraphIndexing` | Index git graph for context |
| `cursor.general.emailPrivacyEnabled` | Hide user email in UI |
| `cursor.general.globalCursorIgnoreList` | Global .cursorignore patterns |
| `cursor.general.reduceTransparency` | Reduce transparency effects |
| `cursor.terminal.enableAiChecks` | AI-powered terminal checks |
| `cursor.terminal.usePreviewBox` | Terminal preview UI |
| `cursor.inlineDiff.enablePerformanceProtection` | Throttle large diffs |
| `cursor.chat.smoothStreaming` | Smooth streaming animation |
| `cursor.chatMaxWidth` | Max width of chat panel |
| `cursor.chatEditorGroup.enabled` | Chat as editor tab group |
| `cursor.worktreeMaxCount` | Max parallel worktrees |
| `cursor.worktreeCleanupIntervalHours` | Cleanup interval for stale worktrees |
| `cursor.rpcFileLogger.enabled` | Log RPC calls to file |
| `cursor.rpcFileLogger.folder` | Folder for RPC logs |
| `cursor.debug.timeoutPrevention` | Prevent debug timeouts |
| `cursor.remote.isSSH` | Is this a remote SSH session |
| `cursor.featureStatus.dataPrivacyOnboarding` | Privacy onboarding completion |
| `cursor.rules.convertLegacyAgentAppliedRules` | Auto-convert old rules format |
| `cursor.blame.hoverDelay` | Git blame hover delay |
| `cursor.semanticSearch.includeCommitsWithFiles` | Include commits in semantic search |
| `cursor.localParallelAgentsDisableRecommender` | Disable recommender for local parallel agents |

### Hook Events [repro-local]

Cursor's hooks system (`cursorHooksService`) fires at well-defined lifecycle steps. Each hook step can block execution or respond with `{continue: false, user_message: "..."}`.

**Hook step enum** (`zf.*` in minified code):

| Step name | Trigger |
|-----------|---------|
| `beforeSubmitPrompt` | Before user message is sent to AI |
| `afterAgentResponse` | After each AI response turn |
| `afterAgentThought` | After extended thinking block |
| `afterFileEdit` | After agent writes a file |
| `afterTabFileEdit` | After Tab autocomplete applies a file edit |
| `beforeReadFile` | Before agent reads a file |
| `beforeTabFileRead` | Before Tab autocomplete reads a file |
| `afterMCPExecution` | After MCP tool execution |
| `beforeMCPExecution` | Before MCP tool execution |
| `afterShellExecution` | After shell command completes |
| `beforeShellExecution` | Before shell command runs |
| `preToolUse` | Before any tool call |
| `postToolUse` | After successful tool call |
| `postToolUseFailure` | After failed tool call |
| `preCompact` | Before context compaction |
| `sessionStart` | Session begin |
| `sessionEnd` | Session end |
| `subagentStart` | Sub-agent spawned |
| `subagentStop` | Sub-agent terminated |
| `stop` | Stop signal received |

**cursorHooksService methods:**
- `executeHookForStep(step, args)` — run hooks for a given step
- `hasHookForStep(step)` — check if any hook is registered for step
- `hasAnyHooks()` — check overall hooks presence
- `getAllConfiguredHooks()` — enumerate all hooks
- `getHooksCounts()` — count hooks by step
- `getHooksConfigErrors()` — validate hooks config
- `getHookExecutionLog()` / `clearHookExecutionLog()` — debug log
- `getUserConfigUri()` / `getProjectConfigUris()` / `getEnterpriseConfigUri()` / `getEnterpriseConfigDirectory()` — config file locations
- `initializeSessionTracking(sessionId)` / `cleanupSessionTracking()` / `hasSessionEndFired()` / `markSessionEndFired()`
- `getSessionMetadata()` / `setSessionEnvironment(env)`
- `onDidHooksChange` — event fired when hooks config changes

**Hook step human-readable names** (mapped internally):
- `beforeSubmitPrompt` → "UserPromptSubmit"
- `afterFileEdit` → "Write"
- `beforeReadFile` → "Read"
- `afterTabFileEdit` → "TabWrite"
- `afterAgentResponse` → "AgentResponse"
- `afterAgentThought` → "AgentThought" (inferred)
- `stop` → "Stop"

### Tool Names [repro-local]

Complete list extracted from `_params` / `_result` / `_stream` pattern matching (78 unique tools):

**File operations:**
`read_file`, `read_chunk`, `read_with_linter`, `read_lints`, `new_file`, `save_file`, `edit_file`, `edit_file_v2`, `new_edit`, `undo_edit`, `reapply`, `apply_agent_diff`, `delete_file`, `create_rm_files`

**Search / navigation:**
`file_search`, `glob_file_search`, `ripgrep_search`, `ripgrep_raw_search`, `semantic_search`, `semantic_search_full`, `read_semsearch_files`, `search_symbols`, `get_symbols`, `gotodef`, `go_to_definition`, `codebase_search`, `deep_search`, `grep`

**Terminal / shell:**
`run_terminal_commands`, `write_shell_stdin`, `bash`, `computer_use`, `record_screen`, `background_shell_spawn`, `force_background_shell`

**MCP integration:**
`call_mcp_tool`, `get_mcp_tools`, `list_mcp_resources`, `read_mcp_resource`, `fetch_mcp_resource`, `mcp_auth`

**Web / browser:**
`web_fetch`, `web_search`, `browser_click`, `browser_navigate`, `browser_scroll`, `browser_type`, `browser_screenshot`, `fetch`

**Project structure:**
`list_dir`, `get_project_structure`, `read_project`, `update_project`, `get_tests`, `run_test`, `add_test`, `delete_test`

**Planning:**
`create_plan`, `spec`, `todo_read`, `todo_write`

**Git / version control:**
`commit`, `commit_and_push`, `create_branch_and_commit`, `create_branch_commit_and_push`, `push`, `fix_merge_conflicts`, `fetch_pull_request`, `create_pr`, `create_pr_with_changes`, `babysit_pr_in_cloud`

**Linting / diagnostics:**
`read_lints`, `fix_lints`, `diagnostics`, `report_bugfix_results`

**Agentic control:**
`switch_mode`, `ask_question`, `task`, `await_task`, `async_task`, `force_background_subagent`, `background_composer_followup`, `heal_stale_composer`, `fetch_rules`, `cursor_rules`

**Collaboration / multi-model:**
`knowledge_base`, `add_ui_step`, `generate_image`, `create_diagram`, `synthesis_subagent` (inferred from `synthesis_subagent_config`)

**Image generation:**
`generate_image`

**Misc:**
`edit`, `search`, `function`, `generic`, `end`, `done`, `final_tool`, `chain_of_thought`, `classified`

**Tool call handler modules** (agent browser process):
```
toolCallHandlers/askQuestion
toolCallHandlers/createPlan
toolCallHandlers/edit
toolCallHandlers/generateImage
toolCallHandlers/mcpAuth
toolCallHandlers/shell
toolCallHandlers/switchMode
toolCallHandlers/task
toolCallHandlers/todo
toolCallHandlers/webFetch
toolCallHandlers/webSearch
```

### Plan System [repro-local]

Plans use the URI scheme `cursor-plan://` (internally `Cn.cursorPlan`). Plan files are stored as `/{planId}.plan.md` under the `plan` authority.

**Observed internal plan service calls:**
- `writePlanFileWithFallback(planId, content)` — write plan markdown to storage
- `resolveVirtualUri(uri)` — resolve `cursor-plan://` URIs
- `planFileUri`, `planFileContent`, `planId`, `planFilePath`, `executionMode` — plan object fields
- `isProject: true/false` — whether the plan is a project plan
- `status: "cancelled"` — plan cancellation state tracked
- Execution mode: `AU.AGENT` — plans executed in agent mode

**Plan URI format:** `cursor-plan://plan/{uuid}.plan.md`

### Background Agent / Glass Mode [repro-local]

**`createdFromBackgroundAgent`** is a field on the composer data object:
```typescript
createdFromBackgroundAgent?: {
  bcId: string;           // Background Composer ID
  shouldStreamMessages: boolean;
  kickoffMessageId: string;
}
```

**Detection logic** — a composer is a background agent if:
```javascript
!!e?.createdFromBackgroundAgent?.bcId || !!e?.pendingBackgroundAgent
```

**Background agent mode** — `getComposerUnifiedMode() === "background"` OR `createdFromBackgroundAgent?.bcId` is set.

**Glass mode** — the "Glass" surface is Cursor's unified agent-IDE window. Key flags:
- `cursor.glass.enrolled` — user opted into Glass
- `cursor.glassModeAvailable` — feature gate
- `cursor.agentIdeUnification.enabled` — Glass/IDE unification toggle
- `glassWorktreeMode` — values: `"fresh"` (new worktree), `"existing"` (attach to existing), `"manual"`, `"readOnly"`

**Worktrees** — each background agent can run in a dedicated git worktree:
- `cursor.worktreeMaxCount` — max parallel worktrees (default configurable)
- `cursor.worktreeCleanupIntervalHours` — cleanup schedule
- Worktrees stored under `~/cursor/worktrees`
- `glassValidatedRepoWorkspace` — validation flag

**Best-of-N** — multi-model evaluation system:
- `bestOfNGroupId` — groups parallel attempts
- `bestOfNJudgeStatus`, `bestOfNJudgeWinner`, `bestOfNJudgeReasoning` — judge fields
- `best_of_n_group_id`, `best_of_n_default_models` — Statsig config keys
- `background_agent_judge_config` — judge config experiment: `{judgeMode: ...}` (client: false)

### Models Referenced [repro-local]

**Anthropic Claude:**
- `claude-3-haiku-20240307`, `claude-3-sonnet-20240229`, `claude-3-opus-20240229`
- `claude-3.5-sonnet`, `claude-3.7-sonnet`
- `claude-3.7-sonnet-finetuned-cursor-20250514-v1` (fine-tuned variant)
- `claude-4-sonnet`, `claude-4-opus`, `claude-4.5-sonnet`, `claude-4.5-haiku`
- `claude-4.5-opus-high`, `claude-4.5-opus-high-thinking`
- `claude-4.6-opus-high-fast`
- `claude-4-5-sonnet-20250929` (dated variant)

**OpenAI GPT / O-series:**
- `gpt-3.5-turbo`, `gpt-4`, `gpt-4o`, `gpt-4o-mini`, `gpt-4.1-mini`
- `gpt-5`, `gpt-5-high`, `gpt-5-mini`
- `gpt-5.1-codex`, `gpt-5.2-codex-high`
- `o1-mini`, `o1-preview`, `o3-mini`

**Google Gemini:**
- `gemini-1.5-flash`, `gemini-1.5-flash-8b`, `gemini-1.5-preview`
- `gemini-2.5-flash`, `gemini-2.5-pro`

**Cursor internal:**
- `cursor-default` (route to default model per account tier)

### API Endpoints [repro-local]

| URL | Purpose |
|-----|---------|
| `https://agent.api5.cursor.sh` | Primary agent API |
| `https://agentn.api5.cursor.sh` | Agent API (n-variant) |
| `https://agent-gcpp-uswest.api5.cursor.sh` | Agent API (GCP, US West) |
| `https://agentn-gcpp-apsoutheast.api5.cursor.sh` | Agent API (GCP, AP Southeast) |
| `https://agentn-gcpp-eucentral.api5.cursor.sh` | Agent API (GCP, EU Central) |
| `https://agentn-gcpp-uswest.api5.cursor.sh` | Agent API (GCP, US West, n-variant) |
| `https://api2.cursor.sh` | General API v2 |
| `https://api3.cursor.sh` | Statsig proxy + telemetry |
| `https://api4.cursor.sh` | General API v4 |
| `https://prod.authentication.cursor.sh` | Auth service |
| `https://marketplace.cursorapi.com` | Extension marketplace |
| `https://changelog.cursor.com` | Changelog / release notes |
| `https://downloads.cursor.com` | Update downloads |
| `https://review.cursor.com` | Code review service |
| `https://repo42.cursor.sh` | Repository service |
| `https://dev.cursorvm-manager.com` | VM manager (dev) |
| `https://eval1.cursorvm-manager.com` | VM manager (eval pools 1–2) |
| `https://test1.cursorvm-manager.com` | VM manager (test) |
| `https://train1–5.cursorvm-manager.com` | VM manager (training pools 1–5) |
| `https://us1–7.cursorvm-manager.com` | VM manager (prod US 1–7) |
| `https://us1p–7p.cursorvm-manager.com` | VM manager (prod US 1–7, p-variant) |
| `https://us3.cursorvm-manager.com` | VM manager (prod US 3) |
| `https://docs.anysphere.dev/sandboxing` | Sandboxing documentation |
| `https://dev-staging.cursor.sh` | Dev/staging environment |
| `https://staging.cursor.sh` | Staging environment |

**Notable:** `cursorvm-manager.com` hosts the compute infrastructure for background agents / Glass mode evaluation VMs. The presence of `eval1`, `eval2`, `train1–5`, `us1–7` pools suggests a large fleet of ephemeral VM environments used for agent execution and model evaluation.

---

## vscode.d.ts — Cursor-Specific Additions [repro-local]

File: `/usr/share/cursor/resources/app/out/vscode-dts/vscode.d.ts` (21 038 lines)

### New top-level exports

```typescript
// Line 22 — exposed alongside the standard `version` export
export const cursorVersion: string;
```

### ExtensionContext additions

```typescript
// Line 8528 — added to the standard ExtensionContext interface
readonly isDevelopment: boolean;
// "Whether this is running on dev or prod for Cursor!!"
```

### env namespace additions

```typescript
// Lines 10905–10907
export namespace env {
  // "Cursor addition: bundled node binary."
  export function bundledNodePath(): string | undefined;
}
```

### Summary of d.ts Cursor-specific surface

| Symbol | Location | Description |
|--------|----------|-------------|
| `vscode.cursorVersion` | Module root | Cursor version string (distinct from `vscode.version`) |
| `ExtensionContext.isDevelopment` | `ExtensionContext` interface | `true` in dev/nightly builds |
| `env.bundledNodePath()` | `env` namespace | Path to Cursor's bundled Node.js binary |

---

## Shadow Workspace [repro-local]

The shadow workspace is a secondary, hidden workspace used for AI-context analysis without modifying the user's actual workspace.

**Service:** `ShadowWorkspaceService` (gRPC: `aiserver.v1.ShadowWorkspaceService`)  
**Config:** `cursor.general.enableShadowWorkspace`  
**Home path:** determined by `shadowWorkspacesHome` (path ends with `.$cursor` extension)

**Lifecycle methods:**
- `openShadowWorkspace()` / `closeShadowWorkspace()`
- `getServerSocketPath()` — IPC socket for shadow workspace server

**Compile-time flag:** `disable_shadow_workspace_debugging__` — debug visibility of the shadow workspace is stripped in stable builds.

---

## Privacy Mode [repro-local]

Privacy mode prevents data from being sent to AI training. Observed state keys:

| Key | Description |
|-----|-------------|
| `privacy_mode_enabled` | Privacy mode on/off |
| `privacy_mode_forced` | Enterprise-forced privacy mode |
| `privacy_mode_migration_opted_out` | User explicitly opted out of migration |
| `privacy_mode_acknowledgement_onboarding` | Onboarding acknowledgement state |
| `privacy_mode_status` | Current privacy status string |
| `privacyModeVersionToggle` | Per-version privacy toggle |
| `cursor.general.emailPrivacyEnabled` | Hide user email |
| `cursor.featureStatus.dataPrivacyOnboarding` | Onboarding completion flag |

**Compile-time flag:** `allow_skip_privacy_mode_grace_period__` — a flag that, when present (dev builds), allows skipping the privacy mode grace period. Stripped in stable.

---

## Key Observations

1. **node_modules.asar is empty.** Unlike older Electron apps that bundle all node_modules into the asar, Cursor ships them as a plain directory. The `.asar` file is a 28-byte stub `{"files":{}}`. [repro-local]

2. **9 named composer modes.** The `composerModesService` manages: `agent`, `background`, `chat`, `debug`, `edit`, `normal`, `plan`, `project`, `spec`. Not all modes are user-visible; `background` and `normal` are internal routing modes. [repro-local]

3. **78 agent tool names.** The tool surface is substantially larger than what is documented externally. Notable additions: `create_diagram`, `generate_image`, `babysit_pr_in_cloud`, `knowledge_base`, `heal_stale_composer`, `force_background_subagent`, `add_ui_step`, `record_screen`. [repro-local]

4. **20 hook step events.** The hooks system covers the full agent lifecycle including MCP execution boundaries (`beforeMCPExecution`, `afterMCPExecution`), shell execution, sub-agent lifecycle, and context compaction. [repro-local]

5. **cursorVM fleet.** 21 distinct `cursorvm-manager.com` hostnames suggest a fleet of 12+ production VM pools (us1–7 × 2 variants), 2 eval pools, 5 training pools. This is the infrastructure behind background agent compute. [repro-local]

6. **Fine-tuned model.** `claude-3.7-sonnet-finetuned-cursor-20250514-v1` is present — a custom Cursor fine-tune of Claude 3.7 Sonnet, presumably for better code editing behaviour. [repro-local]

7. **41 compile-time strips.** The `removeLinesBeforeCompiling` array reveals 41 capability areas that exist in source but are removed for stable builds. Many indicate sophisticated debugging tooling (AI debugger, CPP eval, cursoreval) that is only active in dev/nightly. [repro-local]

8. **vscode.d.ts additions are minimal.** Only 3 Cursor-specific symbols added to the extension API: `cursorVersion`, `ExtensionContext.isDevelopment`, `env.bundledNodePath()`. [repro-local]
