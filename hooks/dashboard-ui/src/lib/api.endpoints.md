# Daemon API endpoint reference

This table is the contract between `api.ts` and `hooks/daemon.ts`.
Update **both** sides if a route changes; tests in `api.test.ts` enforce the
HTTP method and URL shape.

## Base URL

`http://localhost:${window.OMC_DAEMON_PORT ?? 27847}`, resolved at request
time so the same compiled bundle works against any daemon port.

## Result shape

Every function returns `Promise<Result<T>>`:

```ts
type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError }

type ApiError =
  | { kind: 'http'; status: number; body?: unknown; message?: string }
  | { kind: 'network'; message: string }
  | { kind: 'parse'; message: string }
```

Nothing throws. Callers branch on `r.ok`.

## Endpoints

| Function              | Method | Path                  | Query / Body                                      | Returns         |
|-----------------------|--------|-----------------------|---------------------------------------------------|-----------------|
| `getHealth`           | GET    | `/health`             | `?conversationId=…` (optional)                    | health object   |
| `getSessions`         | GET    | `/sessions`           | none                                              | session list    |
| `getSessionLog`       | GET    | `/session-log`        | `?limit=N&session=ID` (both optional)             | event entries   |
| `clearSessionLog`     | POST   | `/session-log/clear`  | `?sessionId=…&conversationId=…` (both optional)   | `{ status }`    |
| `getConfig`           | GET    | `/config`             | none                                              | hook config     |
| `getFullConfig`       | GET    | `/config/full`        | none                                              | full config     |
| `saveConfig`          | POST   | `/config`             | JSON body = config draft, `Content-Type: application/json` | `{ status, path }` on 200; `{ error, issues }` on 400 |
| `getBackgroundTasks`  | GET    | `/backgroundTasks`    | none                                              | task list       |
| `getAgentHistory`     | GET    | `/agentHistory`       | `?limit=N` (optional)                             | history entries |

## Notes

- `clearSessionLog` is **POST** in the daemon (`hooks/daemon.ts`, route guarded
  by `req.method === "POST"`). The daemon also accepts the same params via the
  JSON body; we send them as query params for symmetry with other GET-shaped
  reads where the daemon merges `url.searchParams` into the parsed input.
- `/health`, `/backgroundTasks`, and `/agentHistory` are members of the
  daemon's `GET_ALLOWED_ROUTES` whitelist; all other handler-mapped routes
  reject non-POST with 405.
- Server-Sent Event endpoints (`/events/stream`, `/sessions/stream`) are NOT
  consumed via this client; they are handled by `lib/sse.ts`.
