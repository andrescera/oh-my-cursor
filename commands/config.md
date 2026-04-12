# Config

Display the current merged oh-my-cursor configuration. Read-only: do not edit config files or offer a config UI from this command.

## Instructions

1. Query the daemon config endpoint (use **Shell** with `curl` or equivalent):

   ```bash
   curl -s "http://localhost:${OH_MY_CURSOR_DAEMON_PORT:-47847}/config"
   ```

2. Parse the response and show it as **formatted JSON** (pretty-printed, valid structure). If the request fails, report the error and remind the user the daemon must be running.

## Config file locations

| Priority | Path | Description |
|----------|------|-------------|
| 1 (lowest) | Built-in defaults | Hardcoded in `hooks/config.ts` |
| 2 | `~/.config/oh-my-cursor/config.jsonc` | User-level config |
| 3 (highest) | `.cursor/oh-my-cursor.jsonc` | Project-level config |

**Merge order:** defaults → user → project. Project-level values override user-level values, which override defaults.

## Notes

- Config is cached for about **30 seconds**. Changes apply after cache expiry or a **daemon restart**; do not assume edits are live immediately.
- Config files use **JSONC** (JSON with `//` and `/* */` comments).
- Unknown keys may produce **warnings in daemon logs**; they are not shown in this endpoint output alone.
