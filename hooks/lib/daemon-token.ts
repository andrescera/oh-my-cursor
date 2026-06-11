import { existsSync, readFileSync, mkdirSync, chmodSync } from "node:fs"
import { join } from "node:path"
import { randomBytes, timingSafeEqual } from "node:crypto"
import { writeFileAtomic } from "./atomic-file"
import { loadConfig } from "../config"

// Localhost shared-secret auth for the daemon's sensitive/diagnostic routes.
// The token is sourced (in priority order) from the OH_MY_CURSOR_DAEMON_TOKEN
// env var, the user config `daemon.auth_token`, or a generated value persisted
// to ~/.config/oh-my-cursor/daemon.token (0600). Hook event routes and /health
// stay open; only diagnostic/data routes require the token.

function configDir(): string {
  return join(process.env.HOME ?? "/tmp", ".config", "oh-my-cursor")
}

export function getTokenFilePath(): string {
  return join(configDir(), "daemon.token")
}

function fromEnv(): string | null {
  const env = process.env.OH_MY_CURSOR_DAEMON_TOKEN
  return env && env.trim() !== "" ? env.trim() : null
}

function fromConfig(): string | null {
  try {
    const token = loadConfig().daemon.auth_token
    return token && token.trim() !== "" ? token.trim() : null
  } catch {
    return null
  }
}

function fromFile(): string | null {
  try {
    const p = getTokenFilePath()
    if (!existsSync(p)) return null
    const t = readFileSync(p, "utf-8").trim()
    return t !== "" ? t : null
  } catch {
    return null
  }
}

// Read the active token without creating one. Returns null when no token is
// configured anywhere. Used by sidecar/CLI clients that must present the token.
export function readToken(): string | null {
  return fromEnv() ?? fromConfig() ?? fromFile()
}

// Resolve the daemon's token, generating and persisting a new one when none
// exists. An env-supplied token is used verbatim and never written to disk so
// tests and isolated runs do not clobber the user's persisted token.
export function getOrCreateToken(): string {
  const env = fromEnv()
  if (env) return env

  const config = fromConfig()
  if (config) {
    persistToken(config)
    return config
  }

  const file = fromFile()
  if (file) return file

  const token = randomBytes(32).toString("hex")
  persistToken(token)
  return token
}

function persistToken(token: string): void {
  try {
    const dir = configDir()
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 })
    try {
      chmodSync(dir, 0o700)
    } catch {
      /* best-effort dir hardening */
    }
    writeFileAtomic(getTokenFilePath(), token, { mode: 0o600 })
  } catch (err) {
    console.error(
      "[oh-my-cursor] Failed to persist daemon token:",
      err instanceof Error ? err.message : String(err),
    )
  }
}

// Constant-time comparison; false on any length/format mismatch.
export function tokensMatch(
  provided: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (!provided || !expected) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

// Extract a presented token from the Authorization header (Bearer), the
// X-Daemon-Token header, or a `token` query param (needed for EventSource and
// browser navigation, which cannot set request headers).
export function extractProvidedToken(req: Request, url: URL): string | null {
  const auth = req.headers.get("authorization")
  if (auth) {
    const match = /^Bearer\s+(.+)$/i.exec(auth.trim())
    if (match && match[1]) return match[1].trim()
  }
  const headerToken = req.headers.get("x-daemon-token")
  if (headerToken && headerToken.trim() !== "") return headerToken.trim()
  const queryToken = url.searchParams.get("token")
  if (queryToken && queryToken.trim() !== "") return queryToken.trim()
  return null
}
