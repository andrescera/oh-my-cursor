Dispatch to **prometheus** (the strategic planning agent) for the full planning pipeline.

## Steps

1. **Ambiguity analysis**: Prometheus classifies the intent (refactoring, greenfield, architecture, research) and identifies hidden requirements, scope boundaries, and failure points.
2. **Codebase exploration**: Dispatch parallel explore agents to map relevant patterns, existing implementations, and conventions.
3. **Gap analysis**: Dispatch to metis for pre-planning risk assessment and missing requirements.
4. **Strategic plan**: Prometheus generates a detailed work plan with parallel execution waves, dependency matrix, per-task acceptance criteria, and QA scenarios. Plan is written to `.cursor/plans/`.
5. **Plan review** (optional): Dispatch to momus for quality audit. Iterate until plan passes review.

Present the reviewed plan. Do NOT begin implementing until user confirms. After confirmation, run `/start-work` to begin execution.
