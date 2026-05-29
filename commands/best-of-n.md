# /best-of-n

Runs the same prompt N times in parallel isolated worktrees and selects the best result.

## Usage
Type `/best-of-n` in the chat. Cursor will:
1. Prompt you for N (number of parallel attempts)
2. Clone the workspace into N isolated worktrees
3. Run your next prompt in all N simultaneously
4. Present a comparison view; select the winner to merge back

## When to use
- High-stakes rewrites where you want to compare approaches
- Exploring multiple implementation strategies for a complex feature
- Generating N variations of a UI component or algorithm

## Agent equivalent
The `best-of-n-runner` subagent_type (`Task(subagent_type="best-of-n-runner")`) is the programmatic equivalent, managed by the task orchestration system.

See also: [`/worktree`](./worktree.md)
