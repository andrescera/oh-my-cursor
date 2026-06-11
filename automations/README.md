# ⚠️ EXPERIMENTAL — Cloud Automation Templates

> **This feature is EXPERIMENTAL.** All automations require `experimental.automations: true` in your oh-my-cursor config (`~/.config/oh-my-cursor/config.jsonc`). Cloud Agents API access and a `CURSOR_API_KEY` are also required.


These templates describe how to configure [Cursor Cloud Agent Automations](https://cursor.com/docs/cloud-agent/automations.md) for common background workflows.

Automations run cloud agents triggered by events from GitHub, Slack, Linear, PagerDuty, webhooks, or schedules.

## Setup

1. Go to [cursor.com/automations](https://cursor.com/automations)
2. Create a new automation
3. Choose a trigger from the templates below
4. Paste the prompt
5. Enable the relevant tools
6. Save and activate

---

## Template: Auto-Review PRs

**Trigger**: GitHub > Pull request opened

**Tools**: Comment on pull request, Read Slack channels (optional)

**Prompt**:
```
Review this pull request for code quality, correctness, and adherence to project standards.

Check for:
1. Type safety issues (as any, @ts-ignore, @ts-expect-error)
2. Empty catch blocks
3. Missing error handling
4. Unused imports or variables
5. Test coverage for changed code
6. Adherence to project conventions (read AGENTS.md for standards)

For each issue found:
- Post an inline comment on the specific line
- Explain WHY it's a problem (not just WHAT)
- Suggest a concrete fix

If the PR looks good overall, approve it with a summary of what was reviewed.
If critical issues exist, request changes with a clear list.
```

---

## Template: Auto-Fix CI Failures

**Trigger**: GitHub > CI completed (on failure)

**Tools**: Open pull request

**Prompt**:
```
The CI check failed on this PR. Analyze the failure and fix it.

Steps:
1. Read the CI output to understand what failed
2. Identify the root cause (test failure, lint error, build error, type error)
3. Fix the issue with the minimal change needed
4. Push the fix to the existing PR branch
5. If the fix is non-trivial, add a comment explaining what was wrong and how you fixed it

Do NOT:
- Suppress type errors with as any or @ts-ignore
- Delete failing tests
- Make unrelated changes
```

---

## Template: Triage Slack Bugs

**Trigger**: Slack > New message in channel (filter: "bug" or "error" or "broken")

**Tools**: Open pull request, Send to Slack, Read Slack channels

**Prompt**:
```
A bug report was posted in Slack. Triage it:

1. Read the Slack message to understand the reported issue
2. Search the codebase for relevant code
3. Determine severity: Critical (blocks users), High (significant impact), Medium (workaround exists), Low (cosmetic)
4. If you can identify a fix:
   - Create a PR with the fix
   - Reply in the Slack thread with the PR link
5. If you cannot fix it:
   - Reply in the Slack thread with your analysis and what you found
   - Include file paths and line numbers for the relevant code

Keep Slack responses concise and actionable.
```

---

## Template: Scheduled Code Health

**Trigger**: Schedule > Weekly (Monday 9am)

**Tools**: Open pull request

**Prompt**:
```
Run a weekly code health check:

1. Check for TODOs and FIXMEs that are older than 2 weeks (git blame)
2. Find unused exports (exported but never imported elsewhere)
3. Identify files over 400 lines that should be split
4. Check for dependency security advisories (npm audit / pip audit)
5. Look for commented-out code blocks

Create a PR with fixes for any quick wins (unused exports, commented code).
For larger issues, create a summary in a GitHub issue or PR comment.
```

---

## Template: Linear Issue Auto-Fix

**Trigger**: Linear > Status changed (to "In Progress")

**Tools**: Open pull request

**Prompt**:
```
A Linear issue was moved to In Progress. Implement it:

1. Read the issue title and description
2. Search the codebase to understand the context
3. Plan the implementation (think before coding)
4. Implement the change following project conventions
5. Add or update tests as needed
6. Open a PR with a clear description linking to the Linear issue

Follow the coding standards in AGENTS.md and .cursor/rules/.
Note: cloud agents do not automatically load `.cursor/rules/` — paste any critical rules directly into the automation prompt if they must be enforced.
Run lints and tests before pushing.
```
