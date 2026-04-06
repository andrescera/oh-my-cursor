Run AI slop cleanup across all changed files in the current branch.

## Steps

1. **Diff**: Run `git diff --name-only` against the default branch to find changed files.
2. **Parallel cleanup**: Dispatch parallel sisyphus-junior workers with the `ai-slop-remover` skill, one per changed file.
3. **Review**: Collect results and review each file for remaining issues.
4. **Fix loop**: If issues remain, re-run cleanup on affected files.

Each worker applies the ai-slop-remover skill to identify and fix: over-commenting, unnecessary abstractions, generic names, AI-generated boilerplate, and redundant type assertions.
