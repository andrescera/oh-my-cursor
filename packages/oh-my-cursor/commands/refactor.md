Dispatch to **sisyphus** for intelligent refactoring with full codebase awareness.

## Phases

1. **Intent gate**: Parse the refactoring target, scope (file/module/project), and strategy (safe/aggressive). If ambiguous, ask ONE clarifying question.
2. **Parallel exploration**: Dispatch explore agents to map dependencies, find all references, identify impact zones, and check test coverage.
3. **Codemap**: Build dependency graph and impact analysis from exploration results.
4. **Test assessment**: Evaluate test coverage. If coverage is low for affected areas, pause and inform user.
5. **Plan**: Create detailed refactoring plan with atomic steps and rollback checkpoints.
6. **Execute**: Step-by-step refactoring with continuous verification. Run lints and tests after EVERY change. Use LSP tools (go-to-definition, find-references, rename) for precise analysis.
7. **Verify**: Full test suite, type check, lint check after completion.

## Rules

- ALWAYS dry-run before applying
- Run tests after EVERY change -- never proceed with failing tests
- Follow existing codebase patterns
- Commit at logical checkpoints
- On 3 consecutive failures: revert to last working state and ask user
