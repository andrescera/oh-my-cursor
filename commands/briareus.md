Activate **Briareus Mode**: decompose the request into many independent micro-tasks and dispatch them all simultaneously via **sisyphus-junior** workers.

## Steps

1. **Decompose**: Break the request into 5-10 independent micro-tasks. Each must be:
   - Scoped to a single file or function
   - Completable in isolation without depending on other micro-tasks
   - Small enough for a worker with minimal context

2. **Spawn**: Dispatch up to 10 workers simultaneously via `Task(subagent_type="sisyphus-junior", model="fast")`, one per micro-task. Use the six-section brief format for each worker prompt.

3. **Minimal context**: Each worker receives ONLY:
   - The specific file path to work on
   - The exact change to make
   - The constraints below

4. **Collect**: Gather all results and verify cross-file consistency.

5. **Fix**: Resolve any integration issues inline rather than re-spawning.

## Worker Constraints

Include these in every worker prompt:

- You have ONE task. Complete it and return.
- Write code with low cognitive complexity: short functions (max 20 lines), minimal nesting (max 2 levels), early returns over nested ifs, no clever tricks.
- Do not explore beyond your assigned file.
- Do not ask questions -- make reasonable assumptions.
- Return: what you changed, what file, and any concerns.

## Sequencing

- If micro-tasks have dependencies, sequence them -- do not parallelize dependent work.
- Verify every worker result before considering done.
- If any worker fails, fix inline -- do not re-spawn.
