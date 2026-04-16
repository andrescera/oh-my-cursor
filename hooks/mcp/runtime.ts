import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs"
import { resolve } from "node:path"

import { serve } from "bun"

import { loadConfig } from "../config"
import { cleanupStaleProcess } from "../process-guard"
import { readPortCoordination, writePortCoordination } from "../port-manager"

function getPluginRoot(): string {
  return resolve(import.meta.dir, "..", "..")
}

const MCP_PORT_FILE = "/tmp/oh-my-cursor-sidecar.port"
const MCP_PID_FILE = "/tmp/oh-my-cursor-sidecar.pid"
const DAEMON_PORT_FILE = "/tmp/oh-my-cursor-daemon.port"
const MAX_PORT_ATTEMPTS = 11

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

function isPortInUseError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const msg = err.message.toLowerCase()
  return msg.includes("eaddrinuse") || msg.includes("address already in use")
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
    serve({ port: actualMcpPort, fetch })
  } else {
    const scanBaseMcpPort = resolvePreferredMcpPortFromDaemonFile(defaultMcpPort)
    actualMcpPort = scanBaseMcpPort
    console.log(`[oh-my-cursor] MCP sidecar starting on port ${actualMcpPort}...`)
    let started = false
    for (let offset = 0; offset < MAX_PORT_ATTEMPTS; offset++) {
      const tryPort = scanBaseMcpPort + offset
      try {
        serve({ port: tryPort, fetch })
        actualMcpPort = tryPort
        started = true
        if (offset > 0) {
          console.log(
            `[oh-my-cursor] Preferred MCP port ${scanBaseMcpPort} in use, using port ${actualMcpPort}`,
          )
        }
        break
      } catch (err) {
        if (isPortInUseError(err)) {
          console.log(`[oh-my-cursor] MCP port ${tryPort} in use, trying next...`)
          continue
        }
        throw err
      }
    }
    if (!started) {
      console.error(
        `[oh-my-cursor] Could not find available MCP port in range ${scanBaseMcpPort}-${scanBaseMcpPort + MAX_PORT_ATTEMPTS - 1}`,
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
