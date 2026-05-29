# Extension Facts — Cursor 3.6.21 Re-Audit

> Generated: 2026-05-29. Source: live install at `/usr/share/cursor/resources/app/`.  
> Baseline doc: `docs/cursor/14-extension-api.md` (Cursor 3.0.16).  
> **DO NOT edit** `docs/cursor/14-extension-api.md` or any `docs/cursor/*.md` — this is a read-only fact sheet for delta analysis.

---

## 1. Build Commit Hash

| Field | 3.0.16 (old) | 3.6.21 (new) | Delta |
|---|---|---|---|
| `commit` | `475871d112608994deb2e3065dfb7c6b0baa0c50` | `e7a7e93f4d75f8272503ecf33cedbaae10114a10` | CHANGED |
| `realCommit` | NOT PRESENT | `e7a7e93f4d75f8272503ecf33cedbaae10114a15` | ADDED |
| `version` | 3.0.16 | 3.6.21 | CHANGED |
| `cursorVersion` | UNVERIFIED — not checked in old audit | NOT PRESENT in product.json | — |

**Source:** `/usr/share/cursor/resources/app/product.json`

**Cross-check note:** The `commit` value (`e7a7e93f4d75f8272503ecf33cedbaae10114a10`) matches the value reported by `cursor --version` captured in `learnings.md` ("commit `e7a7e93f4d75f8272503ecf33cedbaae10114a10`") — consistent.

---

## 2. First-Party Extension Inventory

**Total count:** 18 (unchanged from 3.0.16, but composition changed).

### 2a. Delta summary

| Extension | Status | Notes |
|---|---|---|
| `cursor-agent` | **REMOVED** | Present in 3.0.16; absent in 3.6.21 |
| `cursor-agent-worker` | **ADDED** | New in 3.6.21 |
| `cursor-agent-exec` | CHANGED | New `cursorPseudoterminal` in `enabledApiProposals` |
| All others (16) | UNCHANGED | Same names, same versions (all 0.0.1 or 1.0.0) |

### 2b. Full inventory (alphabetical, 3.6.21)

| Folder | `name` | Version | Publisher | `enabledApiProposals` |
|---|---|---|---|---|
| `cursor-agent-exec` | cursor-agent-exec | 0.0.1 | anysphere | `control`, `cursor`, `cursorTracing`, **`cursorPseudoterminal`** *(new)* |
| `cursor-agent-worker` | cursor-agent-worker | 0.0.1 | anysphere | `cursor`, `cursorNoDeps` *(NEW extension)* |
| `cursor-always-local` | cursor-always-local | 0.0.1 | anysphere | `cursor`, `control`, `externalUriOpener`, `contribSourceControlInputBoxMenu` |
| `cursor-browser-automation` | cursor-browser-automation | 1.0.0 | cursor | `control`, `cursor`, `cursorTracing` |
| `cursor-checkout` | cursor-checkout | 0.0.1 | anysphere | `cursor` |
| `cursor-commits` | cursor-commits | 0.0.1 | anysphere | `control`, `cursor`, `cursorTracing` |
| `cursor-deeplink` | cursor-deeplink | 0.0.1 | anysphere | `cursor`, `control`, `externalUriOpener` |
| `cursor-explorer` | cursor-explorer | 0.0.1 | anysphere | `cursor` |
| `cursor-file-service` | cursor-file-service | 1.0.0 | anysphere | *(none)* |
| `cursor-mcp` | cursor-mcp | 0.0.1 | anysphere | `control`, `cursor`, `cursorTracing` |
| `cursor-ndjson-ingest` | cursor-ndjson-ingest | 0.0.1 | anysphere | *(none)* |
| `cursor-polyfills-remote` | cursor-polyfills-remote | 0.0.1 | anysphere | *(none)* |
| `cursor-resolver` | cursor-resolver | 0.0.1 | anysphere | `cursor`, `cursorNoDeps`, `resolvers` |
| `cursor-resolver-helper` | cursor-resolver-helper | 0.0.1 | anysphere | `cursor`, `cursorNoDeps` |
| `cursor-retrieval` | cursor-retrieval | 0.0.1 | anysphere | `control`, `cursor`, `cursorTracing`, `textSearchProvider2` |
| `cursor-shadow-workspace` | cursor-shadow-workspace | 1.0.0 | anysphere | `cursor` |
| `cursor-socket` | cursor-socket | 0.0.1 | anysphere | `cursor`, `cursorNoDeps` |
| `cursor-worktree-textmate` | worktree-textmate | 0.0.1 | everysphere | *(none)* |

**Note:** `cursor-shadow-workspace` description field in `package.json` shows `%description%` (un-resolved NLS token); the 3.0.16 doc resolved it via `package.nls.json` ("Manages a hidden local window that AI agents can use…").

### 2c. `enabledApiProposals` union (3.6.21)

| Proposal | Extensions using it | Delta vs 3.0.16 |
|---|---|---|
| `control` | cursor-agent-exec, cursor-always-local, cursor-browser-automation, cursor-commits, cursor-deeplink, cursor-mcp, cursor-retrieval | No change |
| `cursor` | cursor-agent-exec, cursor-agent-worker, cursor-always-local, cursor-browser-automation, cursor-checkout, cursor-commits, cursor-deeplink, cursor-explorer, cursor-mcp, cursor-resolver, cursor-resolver-helper, cursor-retrieval, cursor-shadow-workspace, cursor-socket | cursor-agent removed; cursor-agent-worker added |
| `cursorTracing` | cursor-agent-exec, cursor-browser-automation, cursor-commits, cursor-mcp, cursor-retrieval | cursor-agent removed |
| `cursorNoDeps` | cursor-agent-worker, cursor-resolver, cursor-resolver-helper, cursor-socket | cursor-agent-worker added |
| `cursorPseudoterminal` | cursor-agent-exec | **NEW proposal** — not present in 3.0.16 |
| `resolvers` | cursor-resolver | No change |
| `externalUriOpener` | cursor-always-local, cursor-deeplink | No change |
| `contribSourceControlInputBoxMenu` | cursor-always-local | No change |
| `textSearchProvider2` | cursor-retrieval | No change |

---

## 3. `vscode.d.ts` Cursor-Specific Symbol Surface

**Path:** `/usr/share/cursor/resources/app/out/vscode-dts/vscode.d.ts`  
**Line count:** 21,038 (UNCHANGED from 3.0.16 baseline)  
**File size:** 732,348 bytes

### 3a. Confirmed Cursor-specific symbols (re-verified 3.6.21)

All 3 symbols pinned in `14-extension-api.md` still present at essentially the same positions:

| Symbol | Line | Declaration | Status |
|---|---|---|---|
| `cursorVersion` | 22 | `export const cursorVersion: string;` | CONFIRMED — unchanged |
| `ExtensionContext.isDevelopment` | 8,528 | `readonly isDevelopment: boolean;` | CONFIRMED — unchanged |
| `env.bundledNodePath()` | 10,908 | `export function bundledNodePath(): string \| undefined;` | CONFIRMED — unchanged |

**File header note (line 7):** `DO NOT MODIFY THIS FILE. FOR NOW, WE ARE PUTTING ALL CURSOR-SPECIFIC IN THE CURSOR PROPOSED API.`

### 3b. New Cursor-specific additions

**None found.** Exhaustive search for `Cursor addition`, `@cursor`, `cursor-specific`, `cursorTracing`, `cursorNoDeps` markers yielded only the same 3 symbols above. No new Cursor-specific exports were added between 3.0.16 and 3.6.21.

**Total Cursor-specific symbol count: 3** (unchanged).

---

## 4. Cross-Check

| Check | Result |
|---|---|
| `commit` from product.json matches `cursor --version` in learnings.md | ✓ MATCH — both report `e7a7e93f4d75f8272503ecf33cedbaae10114a10` |
| `realCommit` differs by last 2 hex digits from `commit` | Note: `...10114a10` vs `...10114a15` — 5-char suffix diff, consistent with Cursor's build process |

---

## 5. Notable Facts

- **`cursor-agent` is gone.** The old "catch-all agent" extension (large ~4.3M bundle, proposals `control`/`cursor`/`cursorTracing`, activation `*`) was removed and its role appears split into `cursor-agent-exec` (execution, now with `cursorPseudoterminal`) and the new `cursor-agent-worker` (install/run worker process, proposals `cursor`/`cursorNoDeps`).
- **`cursorPseudoterminal` is a new proposal** visible in `cursor-agent-exec`'s manifest. It was not in the 3.0.16 union. This likely enables terminal emulation inside agent execution flows.
- **vscode.d.ts is frozen at the same line count** (21,038) — no structural changes to the public Cursor type surface in 3.6.21 vs 3.0.16.
- **`realCommit`** field is new in product.json for 3.6.21 (absent in old doc's description of 3.0.16). It differs from `commit` by the last 5 hex chars, suggesting a git-describe or build-stamp distinction.
