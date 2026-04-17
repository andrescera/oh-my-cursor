import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs"
import { resolve } from "node:path"

import { serve } from "bun"

import { loadConfig } from "../config"
import { cleanupStaleProcess, killPortSquatter } from "../process-guard"
import { readPortCoordination, writePortCoordination } from "../port-manager"

function getPluginRoot(): string {
  return resolve(import.meta.dir, "..", "..")
}

const MCP_PORT_FILE = "/tmp/oh-my-cursor-sidecar.port"
const MCP_PID_FILE = "/tmp/oh-my-cursor-sidecar.pid"
const DAEMON_PORT_FILE = "/tmp/oh-my-cursor-daemon.port"

function resolvePreferredMcpPortFromDaemonFile(fallbackMcpPort: number): number {
  try {
    if (!existsSync(DAEMON_PORT_FILE)) return fallbackMcpPort
    const raw = readFileSync(DAEMON_PORT_FILE, "utf-8").trim()
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
  writeFileSync(MCP_PORT_FILE, String(port), "utf-8")
}

function removePortFile(): void {
  try {
    if (existsSync(MCP_PORT_FILE)) unlinkSync(MCP_PORT_FILE)
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

  cleanupStaleProcess(MCP_PID_FILE, MCP_PORT_FILE, "sidecar")

  process.on("SIGTERM", () => {
    removePortFile()
    try { unlinkSync(MCP_PID_FILE) } catch {}
    process.exit(0)
  })
  process.on("SIGINT", () => {
    removePortFile()
    try { unlinkSync(MCP_PID_FILE) } catch {}
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

  writePortFile(actualMcpPort)
  writeFileSync(MCP_PID_FILE, String(process.pid), "utf-8")

  const coord = readPortCoordination()
  if (coord) {
    writePortCoordination({ ...coord, sidecar: actualMcpPort, updatedAt: new Date().toISOString() })
  }

  console.log(`[oh-my-cursor] MCP sidecar ready on http://localhost:${actualMcpPort}`)

  return { port: actualMcpPort }
}
