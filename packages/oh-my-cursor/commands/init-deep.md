Generate hierarchical AGENTS.md files for the project.

## What It Does

1. **Discovery**: Fire parallel explore agents + analyze project structure
2. **Score**: Determine which directories warrant their own AGENTS.md
3. **Generate**: Create root AGENTS.md + subdirectory files in parallel
4. **Review**: Deduplicate, trim, validate

## Usage

```
/init-deep                    # Update existing + create new
/init-deep --create-new       # Remove all, regenerate from scratch
/init-deep --max-depth=2      # Limit directory depth (default: 3)
```

## Quality Rules

- Root AGENTS.md: 50-150 lines
- Subdirectory AGENTS.md: 30-80 lines
- Never repeat parent content in child files
- Only document deviations from standard practices
- Telegraphic style, no filler
