# Issues — oh-my-cursor-audit-remediation

## [2026-06-11] Session Start

### Pre-existing Non-blocking Errors
- `cd hooks && npx tsc --noEmit` has pre-existing errors in daemon.test.ts and dashboard-ui — NON-BLOCKING per AGENTS.md
- Task 2 must capture the baseline BEFORE fixing anything

### File Overlap Declarations
- Tasks 8 and 9 both touch `continuation-handlers.ts` — 8 owns /beforeSubmitPrompt + return-shape, 9 owns /stop + stop-continuation
- Tasks 14 and 15 both touch `safety-handlers.ts` — 14 owns response shapes, 15 adds logging only
- Tasks 15 and 16 both touch install scripts — 15 adds token to curl calls, 16 adds test exclusion
- Task 6 and 13 both touch `daemon.ts` /health snapshot — 13 skips if 6 already landed it

### Critical Safety Rule
- QA must NEVER kill or corrupt the live daemon serving the user's session
- Always use isolated ports (28847+) and isolated state dirs (/tmp/omc-qa-*)

### Preserved Behaviors (MUST NOT TOUCH)
- Write-tool-over-CreatePlan: rules/prometheus-plan-brief.mdc, rules/agent-tool-restrictions.mdc:40,67, commands/plan.md:186-187, commands/start-work.md:17-19, docs/cursor/19-known-sharp-edges.md:100-101
- Explicit todos behavior: TodoWrite enforcement surfaces (Task 3 will inventory exact locations)
