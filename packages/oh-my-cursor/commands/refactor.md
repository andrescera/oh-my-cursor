Perform intelligent refactoring with full codebase awareness.

## Process

1. **Understand Intent**: Parse the refactoring target and scope
2. **Explore Codebase**: Launch parallel search agents to map dependencies and patterns
3. **Build Codemap**: Construct dependency graph and impact zones
4. **Assess Tests**: Evaluate test coverage and determine verification strategy
5. **Plan**: Create detailed refactoring plan with atomic steps
6. **Execute**: Step-by-step refactoring with continuous verification
7. **Verify**: Full test suite, type check, lint check after completion

## Usage

`/refactor <target> [--scope=file|module|project] [--strategy=safe|aggressive]`

## Rules

- ALWAYS preview before applying (dry run first)
- Run tests after EVERY change
- Never proceed with failing tests
- Follow existing codebase patterns
- Use LSP tools for precise analysis (go-to-definition, find-references)
- Commit at logical checkpoints
