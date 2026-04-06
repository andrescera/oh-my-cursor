# oh-my-cursor Fork Extraction & Standalone Repo Plan

**Created:** 2026-04-06
**Status:** Draft -- Awaiting Confirmation
**Source Branch:** `feat/oh-my-cursor-context-parity`

---

## TL;DR

Extract the oh-my-cursor plugin from the oh-my-openagent monorepo into a standalone fork, restructure it as a root-level project, set it as default branch, and ensure legal compliance with the SUL-1.0 license.

**Deliverables:** 8 tasks across 3 waves
**Critical path:** Legal compliance (Wave 1) -> Repo restructuring (Wave 2) -> Polish & push (Wave 3)

---

## Legal Analysis

### License: Sustainable Use License (SUL-1.0)

The parent repo uses SUL-1.0 (NOT MIT, NOT Apache). Key obligations for the fork:

| Obligation | Required Action |
|-----------|-----------------|
| Include license copy | Keep `LICENSE.md` with SUL-1.0 text in fork |
| Modification notice | Add prominent notice that this is a modified derivative |
| Attribution | Credit oh-my-openagent as the original source |
| Distribution restriction | Must be distributed free of charge, non-commercially |
| License propagation | Anyone receiving the fork must also get the license terms |
| No removal of notices | Cannot remove copyright/licensing notices from original files |

### CLA Assessment

- CLA is owned by YeonGyu Kim, applies to PR contributions TO the project
- CLA does NOT restrict forking -- it governs inbound contributions
- The fork does NOT need its own CLA unless accepting external contributions
- 170+ contributors signed the upstream CLA; their contributions are in the fork under SUL-1.0

### License Mismatch (Must Fix)

The standalone plugin currently claims MIT in README.md and plugin.json, but the parent code is SUL-1.0. The fork must either:
- **Option A (Recommended):** Use SUL-1.0 for the whole fork (legally sound)
- **Option B:** Dual-license only YOUR original code as MIT, while noting that derived portions are SUL-1.0 (complex, error-prone)

### Verdict: SAFE TO FORK

Forking is explicitly permitted by the SUL-1.0 license as long as the obligations above are met.

---

## Source Inventory

### What's in the plugin tree (98 files)

| Category | Count | Description |
|----------|-------|-------------|
| Hook system | 38 | Daemon, handlers, config, shared, types, tests |
| Agents | 12 | 11 agent definitions + coordinator protocol |
| Commands | 11 | Slash commands (deep-plan, ralph-loop, etc.) |
| Rules | 4 | Orchestrator, coding-standards, anti-patterns, modular-code |
| Skills | 9 | 7 skills with references |
| Scripts | 4 | Config generator, install scripts, daemon scripts |
| Config | 6 | plugin.json, mcp.json, worktrees.json, hooks.json, etc. |
| Docs | 3 | README, DEEPLINKS, automations README |

### External Dependencies: NONE

The plugin has zero imports from other monorepo packages. It is fully self-contained.

---

## Execution Plan

### Wave 1: Legal & Attribution (must be first)

#### T01: Create proper LICENSE and attribution files

**What to do:**
1. Copy `LICENSE.md` from root to the fork root (SUL-1.0)
2. Create `NOTICE.md` with:
   - Statement that this is a derivative work of [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent)
   - Original author: YeonGyu Kim (code-yeongyu)
   - Original license: Sustainable Use License 1.0
   - Modification notice: "This software has been modified from the original oh-my-openagent project"
   - Link to original repository
3. Update README.md credits section to prominently link oh-my-openagent
4. Fix the license field in plugin.json from "MIT" to "SUL-1.0"
5. Fix the license reference in README.md from "MIT" to "SUL-1.0"

**Acceptance Criteria:**
- [ ] LICENSE.md exists at root with full SUL-1.0 text
- [ ] NOTICE.md exists with attribution and modification notice
- [ ] README credits section links to oh-my-openagent
- [ ] No "MIT" license references remain
- [ ] plugin.json license field is "SUL-1.0"

---

### Wave 2: Repo Restructuring (the main work)

#### T02: Move plugin contents to repo root

**What to do:**
1. Move all directories from the former monorepo plugin directory to repo root:
   - `hooks/` -> `hooks/`
   - `agents/` -> `agents/`
   - `commands/` -> `commands/`
   - `rules/` -> `rules/`
   - `skills/` -> `skills/`
   - `scripts/` -> `scripts/`
   - `automations/` -> `automations/`
   - `.cursor-plugin/` -> `.cursor-plugin/`
2. Move root-level files from that plugin directory:
   - `README.md` -> `README.md` (replaces monorepo README)
   - `mcp.json` -> `mcp.json`
   - `worktrees.json` -> `worktrees.json`
   - `DEEPLINKS.md` -> `DEEPLINKS.md`
   - `install.sh` -> `install.sh`
   - `install.ps1` -> `install.ps1`

**Must NOT do:**
- Do not modify file contents during the move (that's T01 and T04)
- Do not move test files separately from their source files

---

#### T03: Remove monorepo-specific files and directories

**What to do:**
1. Remove directories that belong to the monorepo, not the fork:
   - `src/` (oh-my-opencode plugin source)
   - `packages/` (all other packages)
   - `dist/` (build output)
   - `bin/` (CLI binaries)
   - `docs/` (monorepo docs)
   - `script/` (monorepo build scripts)
   - `.opencode/` (opencode config)
   - `.sisyphus/` (agent rules for monorepo)
   - `signatures/` (CLA signatures -- not needed in fork)
   - `local-ignore/` (dev fixtures)
2. Remove monorepo config files:
   - Root `package.json` (monorepo config, not needed)
   - `bunfig.toml` (monorepo test config)
   - `tsconfig.json` (monorepo TypeScript config)
   - `CONTRIBUTING.md` (monorepo contributing guide)
   - `CLA.md` (CLA for the original project)
   - `AGENTS.md` (monorepo AGENTS file)
   - All translated READMEs (README.ko.md, README.ja.md, etc.)
3. Remove monorepo CI workflows:
   - `.github/workflows/ci.yml`
   - `.github/workflows/publish.yml`
   - `.github/workflows/publish-platform.yml`
   - `.github/workflows/cla.yml`
   - `.github/workflows/sisyphus-agent.yml`
   - `.github/workflows/refresh-model-capabilities.yml`
   - `.github/workflows/lint-workflows.yml`
4. Keep `.github/` directory structure for potential future workflows

**Must NOT do:**
- Do not delete LICENSE.md (moved to root in T01)
- Do not delete .cursor/ directory (fork config)
- Do not delete .git/ directory

---

#### T04: Update references and paths

**What to do:**
1. In `install.sh`: paths already reference `$SCRIPT_DIR` so they should work at root level. Verify.
2. In `hooks/hooks.json`: paths reference `$HOME/.cursor/plugins/local/oh-my-cursor/hooks/` -- these are installation-time paths, not source paths. No change needed.
3. In `hooks/daemon.ts`: no monorepo-relative imports. Verify.
4. In `mcp.json`: no monorepo references. Verify.
5. In `.cursor-plugin/plugin.json`: update repository URL to point to the fork repo
6. In `README.md`: 
   - Update any monorepo-relative plugin paths to root-relative paths
   - Update git clone URL to fork repo
   - Update credits to prominently link oh-my-openagent
7. In `DEEPLINKS.md`: no monorepo references. Verify.
8. In `scripts/config-generator.ts`: ensure generated stubs reference `agents/` (not old monorepo paths)

**Acceptance Criteria:**
- [ ] No references to old monorepo plugin directory paths in any file
- [ ] No references to the monorepo structure
- [ ] Repository URL in plugin.json points to fork
- [ ] install.sh works from repo root

---

#### T05: Create minimal repo configuration

**What to do:**
1. Create a minimal `.gitignore` with:
   - `node_modules/`, `/tmp/`, `*.log`, `.DS_Store`
   - `/dist/` if a build step is added later
2. Create `.cursor/rules/` with the fork-specific context rule
3. Keep the existing `.cursor/plans/` for reference
4. Update `.cursor-plugin/plugin.json` with fork-specific metadata

**Acceptance Criteria:**
- [ ] `.gitignore` exists with sensible defaults
- [ ] No monorepo-specific ignore patterns

---

### Wave 3: Branch Setup & Final Polish

#### T06: Set up branch as default

**What to do:**
1. Ensure all changes are on the `feat/oh-my-cursor-context-parity` branch (or a new branch)
2. Push to the fork remote
3. Set as default branch via `gh repo edit --default-branch <branch>`
4. Rename the fork repo to `oh-my-cursor` via `gh repo rename oh-my-cursor`

**Note:** This requires the fork remote to be configured. The current origin points to `code-yeongyu/oh-my-openagent`. The user needs to add their fork remote first.

**Acceptance Criteria:**
- [ ] Fork remote configured
- [ ] Changes pushed to fork
- [ ] Default branch set
- [ ] Repo renamed to oh-my-cursor

---

#### T07: Verify standalone functionality

**What to do:**
1. Run `bun test` in the fork to verify all tests pass
2. Run `bash install.sh --dry-run` to verify install script works from root
3. Verify the hook daemon starts: `bun run hooks/daemon.ts`
4. Verify no broken imports or references to monorepo

**Acceptance Criteria:**
- [ ] All tests pass
- [ ] Install script dry-run succeeds
- [ ] Daemon starts without errors
- [ ] No broken references

---

#### T08: Create CONTRIBUTING.md for the fork

**What to do:**
1. Create a fork-specific CONTRIBUTING.md that:
   - Credits oh-my-openagent as the upstream source
   - States the fork's license (SUL-1.0)
   - Explains the fork's scope (Cursor IDE plugin only)
   - Describes the development workflow (Bun, TypeScript)
   - Does NOT require a CLA (unless you want one)

**Acceptance Criteria:**
- [ ] CONTRIBUTING.md exists
- [ ] Credits upstream project
- [ ] License clearly stated

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| SUL-1.0 prevents commercial use | High | Clearly document license in README; fork is for personal/non-commercial use |
| Missing attribution | Legal | NOTICE.md with full attribution, README credits section |
| Broken references after restructuring | Medium | T04 verifies all paths; T07 integration test |
| Fork gets out of sync with upstream | Low | Document upstream source; can periodically cherry-pick |

---

## Pre-Flight Checklist (Before Starting)

- [ ] User has a GitHub fork (confirm URL)
- [ ] Fork remote is configured in git (need to add it)
- [ ] User confirms license approach (SUL-1.0 for entire fork)
- [ ] User confirms repo name: `oh-my-cursor`
- [ ] User confirms default branch name

---

## Commit Strategy

| Commit | Tasks | Message |
|--------|-------|---------|
| 1 | T01 | `docs: add LICENSE, NOTICE, and attribution for oh-my-openagent fork` |
| 2 | T02+T03 | `refactor: extract oh-my-cursor to repo root, remove monorepo files` |
| 3 | T04+T05 | `fix: update paths and references for standalone repo structure` |
| 4 | T08 | `docs: add CONTRIBUTING.md for standalone fork` |

---

## File Structure After Extraction

```
oh-my-cursor/
├── .cursor-plugin/
│   └── plugin.json
├── .cursor/
│   ├── plans/
│   └── rules/
├── agents/
│   ├── sisyphus.md
│   ├── hephaestus.md
│   ├── oracle.md
│   ├── librarian.md
│   ├── explore.md
│   ├── atlas.md
│   ├── prometheus.md
│   ├── metis.md
│   ├── momus.md
│   ├── sisyphus-junior.md
│   ├── multimodal-looker.md
│   └── protocols/
│       └── coordinator.md
├── commands/
│   ├── deep-plan.md
│   ├── start-work.md
│   ├── ralph-loop.md
│   ├── ulw-loop.md
│   ├── refactor.md
│   ├── briareus.md
│   ├── handoff.md
│   ├── init-deep.md
│   ├── remove-ai-slops.md
│   ├── cancel-ralph.md
│   ├── stop-continuation.md
│   └── help.md
├── hooks/
│   ├── daemon.ts
│   ├── config.ts
│   ├── shared.ts
│   ├── types.ts
│   ├── hooks.json
│   ├── claude-code-compat.json
│   ├── mcp-app.ts
│   ├── mcp-sidecar.ts
│   ├── hook-config.ts
│   ├── hook-tiers.ts
│   ├── context-collector.ts
│   ├── compaction-context-prompt.ts
│   ├── event-logger.ts
│   ├── state-persistence.ts
│   ├── handlers/
│   │   └── (all handler files)
│   └── scripts/
│       ├── start-daemon.sh
│       ├── ensure-daemon.sh
│       └── context-injector.ts
├── rules/
│   ├── orchestrator.mdc
│   ├── coding-standards.mdc
│   ├── anti-patterns.mdc
│   └── modular-code-enforcement.mdc
├── skills/
│   ├── agent-browser/
│   ├── ai-slop-remover/
│   ├── dev-browser/
│   ├── frontend-ui-ux/
│   ├── git-master/
│   ├── playwright/
│   └── review-work/
├── scripts/
│   └── config-generator.ts
├── automations/
│   └── README.md
├── mcp.json
├── worktrees.json
├── install.sh
├── install.ps1
├── DEEPLINKS.md
├── README.md
├── LICENSE.md          # SUL-1.0 (from upstream)
├── NOTICE.md           # Attribution to oh-my-openagent
├── CONTRIBUTING.md     # Fork-specific
└── .gitignore
```
