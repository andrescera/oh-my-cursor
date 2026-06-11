import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs"
import { resolve } from "node:path"

import { serve } from "bun"

import { loadConfig } from "../config"
import { cleanupStaleProcess, killPortSquatter } from "../process-guard"
import { readPortCoordination, writePortCoordination } from "../port-manager"

function getPluginRoot(): string {
  return resolve(import.meta.dir, "..", "..")
}

const SIDECAR_PORT_BASENAME = "oh-my-cursor-sidecar.port"
const SIDECAR_PID_BASENAME = "oh-my-cursor-sidecar.pid"
const DAEMON_PORT_BASENAME = "oh-my-cursor-daemon.port"

function stateDir(): string {
  return process.env.OH_MY_CURSOR_STATE_DIR ?? "/tmp"
}
function mcpPortFile(): string {
  return resolve(stateDir(), SIDECAR_PORT_BASENAME)
}
function mcpPidFile(): string {
  return resolve(stateDir(), SIDECAR_PID_BASENAME)
}
function daemonPortFile(): string {
  return resolve(stateDir(), DAEMON_PORT_BASENAME)
}

// Gates the destructive bootstrap below (kills live sidecar PID, clobbers
// port/pid files, rewrites shared ports.json). Removing this guard re-leaks
// test runs into live state. Bun sets NODE_ENV=test; BUN_TEST=1 is explicit.
export function isTestMode(): boolean {
  return process.env.BUN_TEST === "1" || process.env.NODE_ENV === "test"
}

function resolvePreferredMcpPortFromDaemonFile(fallbackMcpPort: number): number {
  try {
    const file = daemonPortFile()
    if (!existsSync(file)) return fallbackMcpPort
    const raw = readFileSync(file, "utf-8").trim()
    const daemonPort = parseInt(raw, 10)
    if (Number.isFinite(daemonPort) && daemonPort >= 1 && daemonPort <= 65535) {
      return daemonPort + 1
    }
  } catch {
    // ignore invalid or unreadable daemon port file
  }
  return fallbackMcpPort
}


function writePortFile(port: number): void {
  writeFileSync(mcpPortFile(), String(port), "utf-8")
}

function removePortFile(): void {
  try {
    const file = mcpPortFile()
    if (existsSync(file)) unlinkSync(file)
  } catch {
    // best-effort cleanup
  }
}

export async function startSidecar(
  fetch: (req: Request) => Promise<Response>,
): Promise<{ port: number }> {
  const config = loadConfig()
  const envMcpPort = process.env.OH_MY_CURSOR_MCP_PORT
  const defaultMcpPort = config.daemon.mcp_port

  const testMode = isTestMode()

  if (!testMode) await cleanupStaleProcess(mcpPidFile(), mcpPortFile(), "sidecar")

  process.on("SIGTERM", () => {
    removePortFile()
    try { unlinkSync(mcpPidFile()) } catch {}
    process.exit(0)
  })
  process.on("SIGINT", () => {
    removePortFile()
    try { unlinkSync(mcpPidFile()) } catch {}
    process.exit(0)
  })

  let actualMcpPort: number

  if (envMcpPort) {
    actualMcpPort = parseInt(envMcpPort)
    console.log(`[oh-my-cursor] MCP sidecar starting on port ${actualMcpPort} (env override)...`)
    try {
      serve({ port: actualMcpPort, fetch, idleTimeout: 0 })
    } catch (err) {
      console.error(
        `[oh-my-cursor] Failed to bind MCP sidecar on port ${actualMcpPort} (env override):`,
        err instanceof Error ? err.message : String(err),
      )
      process.exit(1)
    }
  } else {
    const preferred = resolvePreferredMcpPortFromDaemonFile(defaultMcpPort)
    console.log(`[oh-my-cursor] MCP sidecar starting on port ${preferred}...`)
    const killResult = await killPortSquatter(preferred, "sidecar")
    if (killResult === "not_us") {
      console.error(
        `[oh-my-cursor] MCP sidecar canonical port ${preferred} is held by a foreign process; aborting.`,
      )
      process.exit(1)
    }
    try {
      serve({ port: preferred, fetch, idleTimeout: 0 })
      actualMcpPort = preferred
    } catch (err) {
      console.error(
        `[oh-my-cursor] Failed to bind MCP sidecar on port ${preferred} (squatter kill returned "${killResult}"):`,
        err instanceof Error ? err.message : String(err),
      )
      process.exit(1)
    }
  }

  if (!testMode) {
    writePortFile(actualMcpPort)
    writeFileSync(mcpPidFile(), String(process.pid), "utf-8")

    const coord = readPortCoordination()
    if (coord) {
      writePortCoordination({ ...coord, sidecar: actualMcpPort, updatedAt: new Date().toISOString() })
    }
  }

  console.log(`[oh-my-cursor] MCP sidecar ready on http://localhost:${actualMcpPort}`)

  return { port: actualMcpPort }
}
