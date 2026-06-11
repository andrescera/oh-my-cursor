# Task 5 — Root Cause: mcp-sidecar test harness leaks into live state

## Summary

`hooks/mcp-sidecar.test.ts` was not isolated from live coordination state. Its
`beforeAll` does `await import("./mcp-sidecar.ts")`, which executes the **real**
sidecar bootstrap against the **real** `/tmp` files and **real** tmux server. The
titular symptom (`echo test-from-mcp-sidecar` reaching live sessions) is one of
**four** confirmed leak vectors. The most severe one actually **SIGTERMs the live
MCP sidecar process**.

## Live state observed at investigation time (baseline evidence)

```
/tmp/oh-my-cursor-ports.json  -> {"daemon":27847,"sidecar":27848,"updatedAt":"2026-06-11T16:23:53.510Z"}
  sha256: 0694d23f9e9818a0c741e8c08ce0af4c3c93b551b8b124e60a4661b2db754f8b
/tmp/oh-my-cursor-sidecar.port -> 40054
/tmp/oh-my-cursor-sidecar.pid  -> 1447736   (a LIVE sidecar process)
tmux session "oh-my-cursor"    -> EXISTS (created Thu Jun 11 10:09:15 2026)
mcp.json                       -> Cursor connects to http://localhost:27848/mcp
```

## Hypotheses checked (in order)

1. **Installed plugin contains test files?** YES.
   `~/.cursor/plugins/local/oh-my-cursor/hooks/mcp-sidecar.test.ts` is present
   (plus ~20 other `*.test.ts`). This means a user running `bun test` inside the
   installed plugin dir would hit every leak below against their live session.
   *Installer exclusion is Task 16's responsibility; this task fixes the harness.*

2. **Does the test import start a sidecar that touches live coordination?** YES.
   `beforeAll` (`mcp-sidecar.test.ts:19-23`) sets `OH_MY_CURSOR_MCP_PORT=47850`
   then `await import("./mcp-sidecar.ts")`. The entrypoint runs
   `await startSidecar(fetchHandler)` (`mcp-sidecar.ts:102`), which:
   - `cleanupStaleProcess(MCP_PID_FILE, MCP_PORT_FILE, "sidecar")` (`runtime.ts:52`)
     reads `/tmp/oh-my-cursor-sidecar.pid` (= 1447736, the **live** sidecar),
     `isProcessAlive` -> true, and **`process.kill(1447736, "SIGTERM")`**
     (`process-guard.ts:34-37`), then unlinks the live `.pid`/`.port` files.
     -> **VECTOR D: the test kills the user's running MCP sidecar.**
   - `writePortFile(actualMcpPort)` / pid write (`runtime.ts:101-102`) overwrite
     `/tmp/oh-my-cursor-sidecar.port`/`.pid` with the test process values.
     -> **VECTOR C: live sidecar port/pid files clobbered.**
   - `readPortCoordination()` + `writePortCoordination({...coord, sidecar: 47850})`
     (`runtime.ts:104-107`) rewrites `/tmp/oh-my-cursor-ports.json`, changing
     `sidecar` 27848 -> 47850 and bumping `updatedAt`.
     -> **VECTOR B: live ports.json mutated (checksum changes).** Cursor (which
     dials `http://localhost:27848/mcp` per `mcp.json:14`) is now mis-coordinated.

3. **Does interactive_bash use the same tmux session name as the live session?** YES.
   `interactive-bash.ts:57` defaults `session_name ?? "oh-my-cursor"`. The test at
   `mcp-sidecar.test.ts:204-207` calls `interactive_bash` with
   `{ command: "echo test-from-mcp-sidecar" }` and **no** `session_name`, so the
   handler runs `tmux has-session -t oh-my-cursor` -> (exists) ->
   `tmux send-keys -t oh-my-cursor "echo test-from-mcp-sidecar" Enter`
   (`interactive-bash.ts:76-79`).
   -> **VECTOR A (the reported symptom): the test types
   `echo test-from-mcp-sidecar` into the live `oh-my-cursor` tmux session.**

4. **Daemon/sidecar logs show the test string?** Not currently (0 occurrences in
   `/tmp/oh-my-cursor-daemon.log`) — the echo lands in the **tmux pane**, not the
   daemon log, which is consistent with Vector A. The daemon log instead shows a
   clean `SIGTERM` shutdown, consistent with Vector D when the live process is
   killed by a test run.

## Confirmed mechanism

The harness imports the production entrypoint, which performs unconditional live
side effects: it (D) kills the live sidecar PID, (C) rewrites its port/pid files,
(B) mutates the shared ports.json, and the `interactive_bash` test (A) sends keys
to the shared `oh-my-cursor` tmux session. None of these were gated for tests, and
none of the file paths / session name were injectable for isolation.

## Fix (isolation, coverage preserved)

- `interactive-bash.ts`: default session is now
  `args.session_name ?? process.env.OH_MY_CURSOR_TMUX_SESSION ?? "oh-my-cursor"`.
  Production default is byte-for-byte unchanged (env unset -> `"oh-my-cursor"`);
  tests set a dedicated `omc-test-${pid}` session. -> closes Vector A.
- `runtime.ts`: file paths are env-injectable via `OH_MY_CURSOR_STATE_DIR`, and an
  `isTestMode()` guard (`BUN_TEST=1` or `NODE_ENV="test"`) skips
  `cleanupStaleProcess`, the port/pid writes, and the `writePortCoordination`
  write — while still binding the HTTP server (the HTTP-layer tests need it).
  -> closes Vectors B, C, D.
- `port-manager.ts`: `/tmp/oh-my-cursor-ports.json` is overridable via
  `OH_MY_CURSOR_PORTS_FILE`. -> defense-in-depth for Vector B.
- `mcp-sidecar.ts`: `startDaemonHealthMonitor()` is skipped under `isTestMode()` so
  importing the entrypoint in tests does not poll the live daemon or leave a
  dangling 30s interval.
- `mcp-sidecar.test.ts`: `beforeAll` sets `BUN_TEST=1`, a random dedicated port,
  `OH_MY_CURSOR_TMUX_SESSION=omc-test-${pid}`, `OH_MY_CURSOR_STATE_DIR`, and a
  pre-seeded isolated `OH_MY_CURSOR_PORTS_FILE`; `afterAll` kills the dedicated
  tmux session and removes the isolated state dir. A regression block locks both
  the ports-file and tmux-session isolation (and the preserved production default).
