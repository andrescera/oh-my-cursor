import { existsSync, readFileSync, writeFileSync } from "node:fs"

const PORTS_FILE = "/tmp/oh-my-cursor-ports.json"

export type PortCoordination = {
  daemon: number
  sidecar: number
  updatedAt: string
}

export function writePortCoordination(ports: PortCoordination): void {
  writeFileSync(PORTS_FILE, JSON.stringify(ports, null, 2), "utf-8")
}

export function readPortCoordination(): PortCoordination | null {
  try {
    if (!existsSync(PORTS_FILE)) return null
    const raw = readFileSync(PORTS_FILE, "utf-8")
    const parsed = JSON.parse(raw) as PortCoordination
    if (typeof parsed.daemon !== "number" || typeof parsed.sidecar !== "number") return null
    return parsed
  } catch {
    return null
  }
}

export function getDaemonPort(defaultPort: number): number {
  const coord = readPortCoordination()
  return coord?.daemon ?? defaultPort
}

export function getSidecarPort(defaultMcpPort: number): number {
  const coord = readPortCoordination()
  if (coord?.daemon) return coord.daemon + 1
  return defaultMcpPort
}
