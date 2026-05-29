# Rules & AGENTS.md

> Cursor 3.6.21 (cursor-bin 3.6.21-1, vscodeVersion 1.105.1, commit e7a7e93f4d75f8272503ecf33cedbaae10114a10). Evidence tags per claim. Re-audited 2026-05-29; claims carry per-claim `last-verified` markers — unmarked claims retain their 3.0.16 baseline and were not re-verified at 3.6.21.

## Rule Sources [official-doc]

| Source | Location | Scope |
|--------|----------|-------|
| Project | `.cursor/rules/*.md` or `*.mdc` | Per-project |
| User | Cursor Settings > Rules | Global |
| Team | Team dashboard (enforceable) | Organization |
| AGENTS.md | Root and nested directories | Proximity-based |

## Rule Types [official-doc]

- **Always** — Applied to every request (`alwaysApply: true` in frontmatter).
- **Intelligent (Agent Decides)** — Agent loads based on description match.
- **Glob** — Applied when working with matching file patterns (`globs` in frontmatter).
- **Manual** — Only when explicitly @-mentioned.

## File Format [official-doc]

- `.md` or `.mdc` files.
- YAML frontmatter with: `description`, `alwaysApply` (boolean), `globs` (array).
- Body is markdown with the rule content.
- Creation: `/create-rule` command or Settings > Rules.

## Precedence [official-doc]

Team > Project > User.

- Team rules are enforceable — cannot be overridden locally.
- Remote rules from GitHub: can install rules from repositories.

## AGENTS.md [official-doc]

- Root `AGENTS.md` applies project-wide.
- Nested `AGENTS.md` files: more specific paths override broader ones.
- Automatically discovered — no frontmatter needed.
- Content treated as always-applied rules for that directory scope.

## Limitations [official-doc]

- Rules do **not** apply to Cursor Tab (autocomplete).
- User rules do **not** apply to Inline Edit (Cmd/Ctrl+K).
- Rules apply in Agent, Ask, Plan, and Debug modes.

## FETCH_RULES [repro-local]

- Dynamic rule loading: agent can fetch rules by description match at runtime.
- Used by oh-my-cursor agents (metis, momus, oracle, atlas) to load contextual rules.

## oh-my-cursor Usage

- Six rule files: `orchestrator.mdc`, `orchestrator-reference.mdc`, `coding-standards.mdc`, `anti-patterns.mdc`, `modular-code-enforcement.mdc`, `agent-tool-restrictions.mdc`.
- Uses `alwaysApply` (orchestrator) and glob patterns.
- FETCH_RULES used by read-only agents for dynamic context loading.

## Cursor 3.1 → 3.6 changes

> **last-verified: 3.6.21** — Re-audited 2026-05-29. Evidence tags per item. Source: `docs/internal/reaudit-3621/feature-discovery-3.1-3.6.md`. <!-- last-verified: 3.6.21 -->

### R-01 · Context Usage Breakdown `[official-doc]`

- **Version:** 3.3 (May 6–7, 2026)
- A new panel shows agent context consumption broken down by category: **rules**, **skills**, **MCPs**, and **subagents**. Use it to diagnose which rules or files are consuming context budget and right-size rule content accordingly.

### R-02 · Plugins bundle rules `[official-doc]`

- **Version:** May 1, 2026 (between 3.2 and 3.3)
- Team Marketplace plugins can now bundle rules alongside MCP servers, skills, hooks, and subagents. Rules are a **first-class deliverable** inside plugins. Three distribution modes control how bundled rules are applied to recipients: **Default Off**, **Default On**, and **Required**. See `docs/cursor/12-plugin-system.md` for full plugin bundling details.

### R-03 · `/Generate Cursor Rules` `[community]` `[repro-local]`

- **Version:** 0.49.x (Apr 2025); confirmed present at 3.6.21
- Command to auto-generate `.cursor/rules` from codebase patterns. Inspects existing project conventions and emits rule files; useful for bootstrapping rules in new or inherited projects.
