# Status

Display the current oh-my-cursor system health and session statistics.

## Instructions

1. Query the daemon status endpoint:
   ```
   curl -s http://localhost:${OH_MY_CURSOR_DAEMON_PORT:-27847}/status
   ```

2. Query the MCP sidecar health:
   ```
   curl -s http://localhost:${OH_MY_CURSOR_SIDECAR_PORT:-27848}/health
   ```

3. Display both results formatted clearly:
   - **Daemon**: uptime, active sessions, tool calls, dispatch counts, memory usage, restart count
   - **Sidecar**: status, available tools, daemon health flag

4. If either endpoint is unreachable, report which service is down and suggest restarting via `bash ~/.cursor/plugins/local/oh-my-cursor/hooks/scripts/start-daemon.sh`.

## Port Coordination

Port assignments are tracked in `/tmp/oh-my-cursor-ports.json`. If the default ports (27847/27848) don't work, check this file for the actual ports.
