# /worktree

Creates a git worktree and an isolated branch for parallel experimentation.

## Usage
Type `/worktree` in the chat to open a new worktree. Cursor will:
1. Create a new git worktree at a sibling path (e.g. `../repo-worktree-<branch>`)
2. Check out a fresh branch from the current HEAD
3. Open a new Cursor window rooted at the worktree

## When to use
- Running risky refactors that should not pollute the main working branch
- Experimenting with two implementations in parallel
- Running `/best-of-n` (which uses worktrees internally)

## Agent usage
Agents can create worktrees programmatically via the `cursor-app-control` MCP `move_agent_to_root` after creating a worktree branch. The native `/worktree` command is the interactive equivalent.

See also: [`/best-of-n`](./best-of-n.md)
