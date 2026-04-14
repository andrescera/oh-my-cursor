# Extension API

> Cursor 3.0.16. Findings tagged [repro-local].
> Cursor-specific extension API is NOT officially documented and may change between versions.

This page inventories first-party extensions shipped under `/usr/share/cursor/resources/app/extensions/cursor-*` [repro-local], their `package.json` metadata, and additions in `vscode.d.ts` from the same install (commit `475871d112608994deb2e3065dfb7c6b0baa0c50` per bundled source maps) [repro-local]. It also notes runtime-only APIs visible in small, readable extension bundles where typings are absent.

**Project note:** oh-my-openagent / oh-my-cursor currently relies on MCP via `mcp.json` (user configuration), not on registering MCP servers from a third-party extension. This document describes what the product ships and what extensions *could* use.

---

## First-party `cursor-*` extensions (alphabetical by folder)

Extension identifier is implied as `{publisher}.{name}` from each `package.json` (e.g. `anysphere.cursor-mcp`) [repro-local].

### cursor-agent [repro-local]

| Field | Value |
| --- | --- |
| **Name / version** | `cursor-agent` 0.0.1 |
| **Publisher** | anysphere |
| **Description** | Cursor agent extension |
| **Main** | `./dist/main` |
| **activationEvents** | `*` |
| **enabledApiProposals** | `control`, `cursor`, `cursorTracing` |
| **contributes** | *(none in package.json)* |
| **extensionDependencies** | `[]` |

**Bundle:** `dist/main.js` is large (~4.3M) and minified; no reliable string-level survey was performed [repro-local].

---

### cursor-agent-exec [repro-local]

| Field | Value |
| --- | --- |
| **Name / version** | `cursor-agent-exec` 0.0.1 |
| **Publisher** | anysphere |
| **Description** | Provides agent execution capabilities for Cursor, enabling agents to run commands, interact with files, and use tools with user permissions and approvals |
| **Main** | `./dist/main` |
| **activationEvents** | `*` |
| **enabledApiProposals** | `control`, `cursor`, `cursorTracing` |
| **contributes** | *(none in package.json)* |

**Bundle:** `dist/main.js` ~4.8M, minified [repro-local].

---

### cursor-always-local [repro-local]

| Field | Value |
| --- | --- |
| **Name / version** | `cursor-always-local` 0.0.1 |
| **Display (NLS)** | Cursor Always Local — *Experimentation @ cursor.sh* (`package.nls.json`) |
| **Publisher** | anysphere |
| **Description** | Implements experimentation features for Cursor |
| **Main** | `./dist/main` |
| **extensionKind** | `ui` |
| **activationEvents** | `onStartupFinished`, `onResolveRemoteAuthority:background-composer` |
| **enabledApiProposals** | `cursor`, `control`, `externalUriOpener`, `contribSourceControlInputBoxMenu` |

**contributes [repro-local]:**

- **menus:** `scm/inputBox` — command `cursor.generateGitCommitMessage` when `scmProvider == git` (command definition not present in this package’s `commands` array).
- **jsonValidation:** `.cursor/environment.json` → `./schemas/environment.schema.json`
- **configuration:** `title`: Cursor Always Local (empty object schema in `package.json`)

**Bundle:** `dist/main.js` large/minified [repro-local].

---

### cursor-browser-automation [repro-local]

| Field | Value |
| --- | --- |
| **Name / version** | `cursor-browser-automation` 1.0.0 |
| **Display name** | Cursor Browser Automation |
| **Publisher** | cursor |
| **Description** | MCP server for browser automation in Cursor |
| **Main** | `./dist/extension.js` |
| **extensionKind** | `ui` |
| **activationEvents** | `onStartupFinished` |
| **enabledApiProposals** | `control`, `cursor`, `cursorTracing` |
| **contributes** | `{}` |

**Bundle:** `dist/extension.js` ~1.6M, webpack/minified; not surveyed in detail [repro-local].

---

### cursor-checkout [repro-local]

| Field | Value |
| --- | --- |
| **Name / version** | `cursor-checkout` 0.0.1 |
| **Publisher** | anysphere |
| **Description** | Checkout provider for branch migration operations |
| **Main** | `./dist/main` |
| **activationEvents** | `*` |
| **enabledApiProposals** | `cursor` |
| **contributes** | *(none in package.json)* |

**Readable bundle [repro-local]:** On activate, calls `vscode.cursor.registerCheckoutProvider(provider)` with a `VscodeCheckoutProvider` class that runs git (fetch/checkout/worktree/push) for cloud-agent style flows. Disposable pushed to `context.subscriptions`.

---

### cursor-commits [repro-local]

| Field | Value |
| --- | --- |
| **Name / version** | `cursor-commits` 0.0.1 |
| **Publisher** | anysphere |
| **Description** | Tracks requests and commits for Cursor online metrics |
| **Main** | `./dist/main` |
| **extensionKind** | `workspace` |
| **activationEvents** | `onStartupFinished` |
| **enabledApiProposals** | `control`, `cursor`, `cursorTracing` |
| **extensionDependencies** | `vscode.git` |
| **contributes** | `commands`: `[]`, `keybindings`: `[]`, `menus`: `{}` |

**Product integration [repro-local]:** `product.json` lists `anysphere.cursor-commits` under `cursorTrustedExtensionAuthAccess`.

**Bundle:** `dist/main.js` ~2.4M, minified [repro-local].

---

### cursor-deeplink [repro-local]

| Field | Value |
| --- | --- |
| **Name / version** | `cursor-deeplink` 0.0.1 |
| **Display name** | Cursor |
| **Publisher** | anysphere |
| **Description** | Handles deep-link URIs. |
| **Main** | `./dist/main` |
| **extensionKind** | `ui` |
| **activationEvents** | `onStartupFinished` |
| **enabledApiProposals** | `cursor`, `control`, `externalUriOpener` |

**contributes [repro-local]:**

- **commands:** `cursor-deeplink.debug.triggerDeeplink` — *Debug: Trigger Arbitrary Deeplink* (category Cursor Deeplink)

**Bundle:** `dist/main.js` ~898k, minified [repro-local].

---

### cursor-explorer [repro-local]

| Field | Value |
| --- | --- |
| **Name / version** | `cursor-explorer` 0.0.1 |
| **Display name** | Cursor Explorer |
| **Publisher** | anysphere |
| **Description** | Workspace extension for Cursor Explorer |
| **Main** | `./dist/main` |
| **extensionKind** | `workspace` |
| **activationEvents** | `onStartupFinished` |
| **enabledApiProposals** | `cursor` |
| **contributes** | `{}` |

**Readable bundle [repro-local]:** On activate, registers `vscode.cursor.registerExplorerProvider(async …)` returning git repositories (path, display path, kind, remotes) by scanning the filesystem.

---

### cursor-file-service [repro-local]

| Field | Value |
| --- | --- |
| **Name / version** | `cursor-file-service` 1.0.0 |
| **Publisher** | anysphere |
| **Description** | Handles indexing and retrieval for Cursor |

**Notable:** No `main`, `activationEvents`, `contributes`, or `enabledApiProposals` in `package.json` [repro-local].

**Bundle:** `dist/main.js` is a minimal stub exporting `DUMMY = 1` only [repro-local].

---

### cursor-mcp [repro-local]

| Field | Value |
| --- | --- |
| **Name / version** | `cursor-mcp` 0.0.1 |
| **Publisher** | anysphere |
| **Description** | Handles MCP for Cursor |
| **Main** | `./dist/main` |
| **extensionKind** | `workspace` |
| **activationEvents** | `onStartupFinished`, `onUri` |
| **enabledApiProposals** | `control`, `cursor`, `cursorTracing` |
| **contributes** | `commands`/`keybindings`/`menus` empty; `configuration`: `{}` |

**Bundle:** `dist/main.js` ~2.8M, minified [repro-local].

---

### cursor-ndjson-ingest [repro-local]

| Field | Value |
| --- | --- |
| **Name / version** | `cursor-ndjson-ingest` 0.0.1 |
| **Display name** | Cursor NDJSON Ingest |
| **Publisher** | anysphere |
| **Description** | HTTP server for ingesting NDJSON logs to workspace/.cursor/debug.log |
| **Main** | `./dist/main` |
| **extensionKind** | `workspace` |
| **activationEvents** | `onCommand:cursor.ndjsonIngest.start`, `onCommand:cursor.ndjsonIngest.reassignPort` |

**contributes — commands [repro-local]:**

- `cursor.ndjsonIngest.start` — Start Server  
- `cursor.ndjsonIngest.stop` — Stop Server  
- `cursor.ndjsonIngest.copyCurl` — Copy curl command  
- `cursor.ndjsonIngest.reassignPort` — Reassign port and restart server  
- `cursor.ndjsonIngest.showStatus` — Show server info  

**contributes — configuration [repro-local]:**

| Key | Type | Default | Notes |
| --- | --- | --- | --- |
| `ndjson.port` | number | `0` | 0 = auto in range 7242–7942 (per description and bundle) |
| `ndjson.bindAddress` | string | `127.0.0.1` | Warning in schema if bound non-localhost |

**Readable bundle [repro-local]:** Registers the above commands; uses workspace folder `…/.cursor` or `~/.cursor/debug-logs`; persists sticky port / path id in `workspaceState` (keys such as `ndjson.allocatedPort`, `ndjson.targetId`, and `.glass` suffixed variants for alternate surfaces); listens on `POST /ingest/{ingestPathId}` with header `X-Debug-Session-Id`; writes `debug-{sessionId}.log`.

**enabledApiProposals:** *(none declared in package.json)* [repro-local].

---

### cursor-polyfills-remote [repro-local]

| Field | Value |
| --- | --- |
| **Name / version** | `cursor-polyfills-remote` 0.0.1 |
| **Publisher** | anysphere |
| **Description** | Polyfills for workspace extension host |
| **Main** | `./dist/main` |
| **extensionKind** | `workspace` |
| **activationEvents** | `*` |
| **contributes** | `{}` |

**enabledApiProposals:** *(none in package.json)* [repro-local].

**Bundle:** `dist/main.js` ~101k, minified single line; not meaningfully keyword-searched [repro-local].

---

### cursor-resolver [repro-local]

| Field | Value |
| --- | --- |
| **Name / version** | `cursor-resolver` 0.0.1 |
| **Publisher** | anysphere |
| **Description** | Background composer remote authority resolver for Cursor |
| **Main** | `./dist/main` |
| **browser** | `./dist/browser/main` |
| **extensionKind** | `ui` |
| **activationEvents** | `onResolveRemoteAuthority:background-composer` |
| **enabledApiProposals** | `cursor`, `cursorNoDeps`, `resolvers` |

**contributes [repro-local]:** `resourceLabelFormatters` for `vscode-remote` authority `background-composer+*` (label `${path}`, workspace suffix `cloud-agent`).

---

### cursor-resolver-helper [repro-local]

| Field | Value |
| --- | --- |
| **Name / version** | `cursor-resolver-helper` 0.0.1 |
| **Publisher** | anysphere |
| **Description** | Connection token provider for Cursor resolver |
| **Main** | `./dist/main` |
| **extensionKind** | `ui` |
| **activationEvents** | `onResolveRemoteAuthority:background-composer`, `onStartupFinished` |
| **enabledApiProposals** | `cursor`, `cursorNoDeps` |

**contributes:** *(none in package.json)* [repro-local].

---

### cursor-retrieval [repro-local]

| Field | Value |
| --- | --- |
| **Name / version** | `cursor-retrieval` 0.0.1 |
| **Publisher** | anysphere |
| **Description** | Handles indexing and retrieval for Cursor |
| **Main** | `./dist/main` |
| **extensionKind** | `workspace` |
| **activationEvents** | `onStartupFinished` |
| **enabledApiProposals** | `control`, `cursor`, `cursorTracing`, `textSearchProvider2` |

**contributes [repro-local]:**

- **commands:** `cursor.grepClient.debug` (Debug Grep Client), `cursor.codebaseTelemetry.triggerSnapshot` (Trigger Codebase Snapshot) — developer category; palette `when`: `isDevelopment`
- **configuration:** `cursor-retrieval.canAttemptGithubLogin` (boolean, default `true`, scope `resource`)
- **languages:** `ignore` for filenames `.cursorignore`, `.cursorindexingignore`

**Product integration [repro-local]:** `anysphere.cursor-retrieval` is in `cursorTrustedExtensionAuthAccess` in `product.json`.

**Bundle:** `dist/main.js` ~4.6M, minified [repro-local].

---

### cursor-shadow-workspace [repro-local]

| Field | Value |
| --- | --- |
| **Name / version** | `cursor-shadow-workspace` 1.0.0 |
| **Display (NLS)** | Cursor Shadow Workspace — *Manages a hidden local window that AI agents can use to refine their code before showing it to you.* |
| **Publisher** | anysphere |
| **Main** | `./dist/extension` |
| **browser** | `./dist/browser/extension` |
| **extensionKind** | `workspace` |
| **activationEvents** | `onStartupFinished` |
| **enabledApiProposals** | `cursor` |
| **contributes** | `commands`: `[]`, `configuration`: `[]` (empty array in manifest) |

**Note [repro-local]:** `package.json` includes an `aiKey` field; value is intentionally omitted here.

**Bundle:** `dist/extension.js` ~1.2M, minified [repro-local].

---

### cursor-socket [repro-local]

| Field | Value |
| --- | --- |
| **Name / version** | `cursor-socket` 0.0.1 |
| **Publisher** | anysphere |
| **Description** | TCP/TLS socket provider for Cursor extensions |
| **Main** | `./dist/main` |
| **extensionKind** | `ui` |
| **activationEvents** | `onResolveRemoteAuthority:background-composer`, `onStartupFinished` |
| **enabledApiProposals** | `cursor`, `cursorNoDeps` |

**contributes:** *(none in package.json)* [repro-local].

**Readable bundle [repro-local]:**

- Registers `vscode.cursor.registerSocketConnectionProvider` and `vscode.cursor.registerSocketServerProvider`.
- Registers command `cursorSocket.injectFailure` (developer/testing; destroys client sockets / injects server failures) — **not** declared under `contributes.commands` in `package.json`.
- Output channel: `Cursor Socket`.

---

### cursor-worktree-textmate [repro-local]

Shipped under folder `cursor-worktree-textmate` but **`package.json` `name` is `worktree-textmate`** (publisher `everysphere`).

| Field | Value |
| --- | --- |
| **Name / version** | `worktree-textmate` 0.0.1 |
| **Display name** | Worktree TextMate Syntax |
| **Description** | Provides TextMate-only syntax highlighting for `.cursor/worktrees` files without activating language servers. |
| **extensionKind** | `ui` |

**No `main` or explicit `activationEvents`** — grammar/language-only extension [repro-local].

**contributes:** Numerous `languages` + `grammars` for `**/.cursor/worktrees/**/*.{ext}` (TypeScript, JS, Python, Go, Rust, Terraform family, etc.) and `configurationDefaults` disabling semantic highlighting for those language IDs [repro-local].

---

## `enabledApiProposals` union (first-party extensions) [repro-local]

| Proposal | Used by (extension folder) |
| --- | --- |
| `control` | cursor-agent, cursor-agent-exec, cursor-browser-automation, cursor-commits, cursor-deeplink, cursor-mcp, cursor-retrieval |
| `cursor` | All listed first-party extensions except cursor-polyfills-remote, cursor-ndjson-ingest, cursor-file-service, cursor-worktree-textmate (those lack the field or are non-extension stubs) |
| `cursorTracing` | cursor-agent, cursor-agent-exec, cursor-browser-automation, cursor-commits, cursor-mcp, cursor-retrieval |
| `cursorNoDeps` | cursor-resolver, cursor-resolver-helper, cursor-socket |
| `resolvers` | cursor-resolver |
| `externalUriOpener` | cursor-always-local, cursor-deeplink |
| `contribSourceControlInputBoxMenu` | cursor-always-local |
| `textSearchProvider2` | cursor-retrieval |

---

## Cursor-specific surface in `vscode.d.ts` [repro-local]

Path: `/usr/share/cursor/resources/app/out/vscode-dts/vscode.d.ts`.

File banner states Cursor-specific proposed API is folded into this typings file [repro-local].

**Clearly Cursor-labeled or version-specific:**

- `export const cursorVersion: string` — Cursor editor version string.
- `ExtensionContext.isDevelopment: boolean` — described as whether the extension runs in dev vs prod for Cursor.
- `env.bundledNodePath(): string | undefined` — comment: *Cursor addition: bundled node binary.*

**MCP / LM namespace (typed in same file) [repro-local]:**

- Classes `McpStdioServerDefinition`, `McpHttpServerDefinition` (stdio and Streamable HTTP MCP server descriptions).
- `lm.registerMcpServerDefinitionProvider(id, provider): Disposable` — dynamic MCP server discovery; requires `contributes.mcpServerDefinitionProviders` with matching `id`.
- Related LM APIs in the same namespace include `registerLanguageModelChatProvider`, `invokeTool`, `tools`, etc. (standard VS Code proposed LM surface; verify upstream vs Cursor if you need strict attribution).

**Not found in this `vscode.d.ts` [repro-local]:** A `vscode.cursor.mcp.registerServer` (or similar) symbol — third-party docs that mention it may refer to another layer or an older name. This install exposes MCP provider registration under `vscode.lm.registerMcpServerDefinitionProvider` as above.

**Runtime `vscode.cursor` usage without matching declarations [repro-local]:** First-party bundles call methods such as `registerCheckoutProvider`, `registerExplorerProvider`, `registerSocketConnectionProvider`, and `registerSocketServerProvider` on `vscode.cursor`. These identifiers do **not** appear in the shipped `vscode.d.ts` (single file under `vscode-dts/`); treat them as internal/proposed runtime API.

---

## Summary: beyond stock VS Code [repro-local]

1. **Version / environment:** `cursorVersion`, `ExtensionContext.isDevelopment`, `env.bundledNodePath()`.
2. **Proposed LM + MCP:** MCP server definition types and `lm.registerMcpServerDefinitionProvider` (+ contribution point `mcpServerDefinitionProviders` as documented in JSDoc in `vscode.d.ts`).
3. **Internal `vscode.cursor` namespace** (observed in Anysphere bundles only; not in public typings file): checkout provider, explorer provider, socket client/server providers.
4. **Remote / cloud agent plumbing:** `background-composer` authority, resolver + socket + polyfills, resource label formatters, optional trusted auth for `cursor-retrieval` / `cursor-commits` in `product.json`.
5. **Editor integration:** NDJSON debug ingest server, deeplink handler, worktree TextMate grammars, retrieval indexing and developer-only commands.

---

## oh-my-openagent / oh-my-cursor relevance

Today, MCP is typically configured through **user/project `mcp.json`** (and Cursor settings), not by shipping an extension that calls `registerMcpServerDefinitionProvider`. This page records **what the Cursor 3.0.16 build ships** so you can compare with that approach if you ever adopt dynamic MCP registration or other proposed APIs [repro-local].
