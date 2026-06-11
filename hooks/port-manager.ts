import { existsSync, readFileSync } from "node:fs"
import { writeFileAtomic } from "./lib/atomic-file"

const DEFAULT_PORTS_FILE = "/tmp/oh-my-cursor-ports.json"

// Must read the env per call (not a module const): tests set the override
// AFTER importing this module, and that timing is what isolates them from the
// live /tmp/oh-my-cursor-ports.json. Folding this into a const re-leaks.
function getPortsFile(): string {
  return process.env.OH_MY_CURSOR_PORTS_FILE ?? DEFAULT_PORTS_FILE
}

export type PortCoordination = {
  daemon: number
  sidecar: number
  updatedAt: string
}

export function writePortCoordination(ports: PortCoordination): void {
  writeFileAtomic(getPortsFile(), JSON.stringify(ports, null, 2))
}

export function readPortCoordination(): PortCoordination | null {
  try {
    const portsFile = getPortsFile()
    if (!existsSync(portsFile)) return null
    const raw = readFileSync(portsFile, "utf-8")
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
