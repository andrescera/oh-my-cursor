# Cloud Agents (EXPERIMENTAL)

> **EXPERIMENTAL**: This command requires `experimental.cloud_agents: true` in your oh-my-cursor config and a `CURSOR_API_KEY` environment variable.

Manage Cursor Cloud Agents from the command line.

## Pre-flight Check

Before executing any subcommand, verify:
1. `experimental.cloud_agents` is `true` in config (query daemon `/config` endpoint)
2. `CURSOR_API_KEY` environment variable is set

If either is missing, display:
```
EXPERIMENTAL: Cloud Agents are not enabled.
Set experimental.cloud_agents: true in ~/.config/oh-my-cursor/config.jsonc
and export CURSOR_API_KEY=<your-key>
```

## Subcommands

### list
List all cloud agents for the current account.
```bash
curl -s -H "Authorization: Bearer $CURSOR_API_KEY" \
  https://api.cursor.com/v1/agents | jq '.agents[] | {id, status, created_at}'
```

### launch
Launch a new cloud agent with a task description.
```bash
curl -s -X POST -H "Authorization: Bearer $CURSOR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"task": "<description>", "repository": "<repo>"}' \
  https://api.cursor.com/v1/agents
```

### status {id}
Get the status of a specific cloud agent.
```bash
curl -s -H "Authorization: Bearer $CURSOR_API_KEY" \
  https://api.cursor.com/v1/agents/{id}
```

### stop {id}
Stop a running cloud agent.
```bash
curl -s -X POST -H "Authorization: Bearer $CURSOR_API_KEY" \
  https://api.cursor.com/v1/agents/{id}/stop
```

## Reference
- [Cloud Agent API Overview](https://cursor.com/docs/cloud-agent/api/overview)
