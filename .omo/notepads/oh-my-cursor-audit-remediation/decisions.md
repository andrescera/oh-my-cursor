# Decisions — oh-my-cursor-audit-remediation

## [2026-06-11] Session Start

### activePlan Durability (Task 9)
- Keep activePlan DURABLE; make CLEARING durable via tombstone field `continuationStoppedAt`
- Do NOT flip activePlan to EPHEMERAL wholesale

### State File Naming (Task 10)
- Use `${hash}-${convId}.json` for project-scoped state keys
- Migration: read legacy `${convId}.json` when projectRoot matches or is empty

### Security Scope (Task 15)
- Token auth on diagnostic/sensitive routes only (not hook event routes)
- No OAuth/per-tool authz/rate limiting; CORS: remove `*` entirely

### Worktree (Task 18)
- Docs-to-reality alignment ONLY — no feature implementation
