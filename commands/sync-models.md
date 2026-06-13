# Sync Models

Capture this agent's live `Task` tool `model` enum and POST it to the daemon's `/reported-models` endpoint so the allowlist stays current with what Cursor actually offers.

## Instructions

1. **Emit your exact current model enum verbatim.** Look at the `model` parameter of your `Task` tool definition — the list of allowed values injected by Cursor at session start. Write out every slug verbatim, one per line. Do not invent slugs, normalize casing, or omit any. These are the live, server-injected values; they are the ground truth.

   Example output (your actual list will differ):
   ```
   composer-2-fast
   composer-2.5
   claude-opus-4-7-thinking-xhigh
   gpt-5.5-extra-high
   ```

2. **Read the Cursor version** from the platform `package.json`. On Linux:

   ```bash
   cat /usr/share/cursor/resources/app/package.json | python3 -c "import sys,json; print(json.load(sys.stdin)['version'])"
   ```

   Or with `jq`:

   ```bash
   jq -r .version /usr/share/cursor/resources/app/package.json
   ```

   On macOS the path is typically `/Applications/Cursor.app/Contents/Resources/app/package.json`. Do not hardcode a version — always read it from `package.json` at runtime.

3. **POST to the daemon.** Read the auth token from `~/.config/oh-my-cursor/daemon.token`, then send the request:

   ```bash
   TOKEN=$(cat ~/.config/oh-my-cursor/daemon.token)
   curl -s -X POST "http://localhost:${OH_MY_CURSOR_DAEMON_PORT:-27847}/reported-models" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"version": "<version>", "models": ["<slug1>", "<slug2>", ...]}'
   ```

   Replace `<version>` with the string from step 2 and the `models` array with the slugs you emitted in step 1 as a JSON array.

4. **Handle the response.**

   - `{"ok": true, ...}` — report the captured count to the user. Done.
   - HTTP `400` — show the `rejected` field from the response body so the user can see what was wrong.
   - `curl` fails with "connection refused" or similar — the daemon must be running before this command can succeed. Tell the user to start the daemon and retry.

## Limitation

The captured enum is a point-in-time snapshot. After a Cursor update, the available model slugs may change, but the stored list stays stale until `/sync-models` is run again in the new version. Capture accuracy depends entirely on the agent transcribing its own descriptor verbatim — any normalization or invention produces a corrupt record.
