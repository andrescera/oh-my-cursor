Remove AI-generated code smells from all changed files in the current branch.

## Process

1. Get changed files: `git diff --name-only` against base branch
2. For each file, spawn a parallel agent with the ai-slop-remover skill
3. After all agents complete, critically review all changes
4. Fix any issues found during review

## What Gets Removed

- Excessive comments narrating code
- Over-abstraction and unnecessary wrappers
- Generic variable names (data, result, item)
- Empty catch blocks
- Console.log in production code
- Commented-out code blocks

## Safety

- Never remove functional logic
- Preserve error handling
- Verify files still compile after changes
- Keep comments that explain WHY
