# Contributing to oh-my-cursor

## Origin

oh-my-cursor is a fork and derivative of [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) by YeonGyu Kim (code-yeongyu). Upstream lives at https://github.com/code-yeongyu/oh-my-openagent.

## License

Contributions are accepted under the Sustainable Use License 1.0 (SUL-1.0). By contributing, you agree your contributions will be licensed under the same terms as the project.

## Development setup

- **Runtime**: Bun. Do not use npm or yarn for project workflows described here.
- **Language**: TypeScript, with strict mode enabled.
- **Install Bun**: `curl -fsSL https://bun.sh/install | bash`
- **Tests**: From the `hooks/` directory, run `bun test` (tests are co-located as `*.test.ts` files).
- **Lint**: Follow standard TypeScript strict mode; fix type errors before opening a pull request.

oh-my-cursor is a Cursor IDE plugin, not a published Node.js package.

## Project structure

| Path | Purpose |
|------|---------|
| `agents/` | Agent definitions (Markdown) |
| `hooks/` | Hook daemon and handlers (TypeScript) |
| `commands/` | Slash commands (Markdown) |
| `rules/` | Cursor rules (`.mdc`) |
| `skills/` | Agent skills (Markdown) |
| `scripts/` | Utility scripts |
| `.cursor-plugin/` | Plugin manifest |

## How to contribute

1. Fork this repository.
2. Create a feature branch from the appropriate base branch.
3. Make focused changes with clear commit messages.
4. Run `bun test` from `hooks/` before you submit.
5. Open a pull request that describes the change and any testing you ran.

## Code style

- Match patterns already used in the codebase.
- Use kebab-case for file names.
- Avoid AI-style comment noise (obvious restatements of what the code does).
- Prefer semantic commit messages: `type: short imperative summary` (for example, `fix: handle empty hook payload`).
