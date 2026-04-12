# Agents

Display the full oh-my-cursor agent inventory with models, roles, and capabilities.

## Instructions

1. Glob all agent definition files:
   ```
   ls ~/.cursor/plugins/local/oh-my-cursor/agents/*.md
   ```

2. For each agent file, extract the YAML frontmatter fields: `name`, `description`, `model`, `readonly`, `is_background`.

3. Display as a formatted table:

   | Agent | Model | Role | Read-only | Background |
   |-------|-------|------|-----------|------------|

4. Group agents by tier:
   - **Coordinators**: sisyphus, hephaestus, atlas (can spawn sub-agents)
   - **Planners**: prometheus (planning only, no implementation)
   - **Reviewers**: metis, momus (read-only analysis)
   - **Workers**: sisyphus-junior (leaf executor, no sub-delegation)
   - **Specialists**: explore, librarian, oracle, multimodal-looker (domain-specific)

5. Include the coordinator protocol worker lists for each coordinator:
   - sisyphus: explore, oracle, librarian, sisyphus-junior, multimodal-looker
   - hephaestus: explore, sisyphus-junior
   - atlas: explore, oracle, sisyphus-junior
