Dispatch parallel **explore** agents to generate a hierarchical AGENTS.md knowledge base for the codebase.

## Process

1. **Structure scan**: Dispatch explore agents in background to analyze directory structure, file counts, and module boundaries.
2. **Code analysis**: Parallel explore dispatches for: key entry points, architecture patterns, dependency graphs, test infrastructure, and build system.
3. **Synthesis**: Merge exploration results into a structured AGENTS.md with: overview, module descriptions, key patterns, conventions, and anti-patterns.
4. **Write**: Create or update AGENTS.md at the project root.

## Flags

- `--create-new`: Generate fresh AGENTS.md (ignore existing)
- `--max-depth N`: Limit directory traversal depth (default: 3)
