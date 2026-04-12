# Agent Nativeness Audit

Tool mapping and native Cursor integration recommendations for all 11 agents.

## Agent Tool Mapping

### sisyphus (Coordinator)
- **Model**: claude-4.6-opus-max-thinking
- **Role**: Main coordinator for complex multi-file work
- **Current Tools**: Task, Read, Write, Shell, StrReplace, Grep, Glob, TodoWrite
- **Recommended Native Tools**: TodoWrite (progress tracking), SwitchMode(debug) on errors
- **is_background**: false (synchronous result handling needed)
- **Mode**: agent (default)

### hephaestus (Coordinator)
- **Model**: gpt-5.4-high
- **Role**: Sustained deep work on single complex problems
- **Current Tools**: Task, Read, Write, Shell, StrReplace, Grep, Glob
- **Recommended Native Tools**: TodoWrite (milestone tracking), SwitchMode(debug) on errors
- **is_background**: false
- **Mode**: agent

### atlas (Coordinator)
- **Model**: claude-4.6-sonnet-medium-thinking
- **Role**: Plan executor — delegates implementation
- **Current Tools**: Task, Read, Glob, TodoWrite
- **Recommended Native Tools**: TodoWrite (primary), FETCH_RULES (context loading)
- **is_background**: false
- **Mode**: agent

### prometheus (Planner)
- **Model**: claude-4.6-opus-max-thinking
- **Role**: Strategic planning — never implements
- **Current Tools**: Read, Write (.md only), Grep, Glob
- **Recommended Native Tools**: AskQuestion (interview), TodoWrite (progress), FETCH_RULES
- **is_background**: false
- **Mode**: plan (invoked from plan mode)

### oracle (Specialist)
- **Model**: gpt-5.4-medium
- **Role**: Architecture consultation — read-only
- **Current Tools**: Read, Grep, Glob, WebSearch
- **Recommended Native Tools**: SwitchMode(ask), FETCH_RULES, SEARCH_SYMBOLS
- **is_background**: false (advice needs immediate consumption)
- **Mode**: ask

### metis (Reviewer)
- **Model**: gpt-5.4-medium
- **Role**: Pre-planning gap analysis — read-only
- **Current Tools**: Read, Grep, Glob
- **Recommended Native Tools**: SwitchMode(ask), FETCH_RULES
- **is_background**: false (gap analysis feeds planning)
- **Mode**: ask

### momus (Reviewer)
- **Model**: gpt-5.4-medium
- **Role**: Plan review and quality audit — read-only
- **Current Tools**: Read, Grep, Glob
- **Recommended Native Tools**: SwitchMode(ask), FETCH_RULES
- **is_background**: false (verdict determines next action)
- **Mode**: ask

### explore (Specialist)
- **Model**: gemini-3-flash
- **Role**: Fast codebase search — read-only
- **Current Tools**: Read, Grep, Glob
- **Recommended Native Tools**: (standard search tools sufficient)
- **is_background**: true
- **Mode**: ask

### librarian (Specialist)
- **Model**: fast (latest Composer)
- **Role**: External doc lookup — read-only
- **Current Tools**: WebSearch, WebFetch, Read
- **Recommended Native Tools**: (standard tools sufficient)
- **is_background**: true
- **Mode**: ask

### sisyphus-junior (Worker)
- **Model**: claude-4.6-sonnet-medium-thinking
- **Role**: Leaf executor — no sub-delegation
- **Current Tools**: Read, Write, Shell, StrReplace, Grep, Glob, ReadLints
- **Recommended Native Tools**: (standard implementation tools — keep simple)
- **is_background**: false
- **Mode**: agent

### multimodal-looker (Specialist)
- **Model**: gemini-3.1-pro
- **Role**: Visual analysis of PDFs, images, diagrams
- **Current Tools**: Read (images/PDFs), GenerateImage
- **Recommended Native Tools**: SwitchMode(ask), GenerateImage
- **is_background**: false
- **Mode**: ask

## Undocumented Tools — NOT Used

These tools were discovered via reverse engineering but have no official documentation. They are NOT referenced in agent prompts or relied upon:

| Tool | Status | Why NOT Used |
|------|--------|-------------|
| REFLECT | No public evidence | Not documented, no known schema |
| KNOWLEDGE_BASE | Reverse-engineered only | No official schema, unreliable |
| READ_PROJECT | Reverse-engineered only | Use Glob + Read instead |
| Triage mode | Not a documented IDE mode | Use orchestrator rules instead |
| DEEP_SEARCH | Internal tool name | Agents choose search strategy automatically |

## Future Considerations

| Tool | Potential Use | When to Adopt |
|------|-------------|---------------|
| COMPUTER_USE | Visual testing via ACP `cursor/task` | When officially documented |
| DEEP_SEARCH | Enhanced semantic search | When public API available |
| RECORD_SCREEN | Session recording for review | When officially documented |
