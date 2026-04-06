---
name: ai-slop-remover
description: "Remove AI-generated code smells from a single file. Identifies and fixes over-commenting, unnecessary abstractions, generic names, and other AI patterns. Use per-file; parallelize for multiple files."
---

# AI Slop Remover

Remove AI-generated code patterns from a single file while preserving functionality.

## What to Remove

- Excessive inline comments that narrate what code does
- Over-abstraction (unnecessary wrappers, single-use utilities)
- Generic variable names (data, result, item, temp, info)
- Redundant type annotations that TypeScript can infer
- Empty error handling (catch blocks that swallow errors)
- Console.log statements left in production code
- Commented-out code blocks
- Unnecessary async/await on synchronous operations

## What to Preserve

- All functional logic and behavior
- Error handling that serves a purpose
- Comments that explain WHY (not WHAT)
- Type annotations on public APIs
- Test coverage

## Process

1. Read the file completely
2. Identify AI slop patterns
3. Remove/fix each pattern
4. Verify the file still compiles (ReadLints)
5. Report what was changed

## Constraints

- ONE file per invocation
- For multiple files, the caller should spawn parallel agents
- Never change functional behavior
- When uncertain, keep the original code
