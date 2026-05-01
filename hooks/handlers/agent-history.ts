import type { AgentHistoryStore } from "../agent-history-store"
import type { HandlerFn } from "../types"

type AgentHistoryFilter = {
  projectRoot?: string
  since?: number
  limit?: number
}

function getDaemonProjectRoot(): string | null {
  const projectRoot = process.env.OH_MY_CURSOR_PROJECT_DIR || process.cwd()
  return projectRoot || null
}

function parseFiniteNumber(input: unknown): number | undefined {
  if (typeof input === "number" && Number.isFinite(input)) {
    return input
  }
  if (typeof input === "string") {
    const parsed = Number(input)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return undefined
}

export function createAgentHistoryHandler(store: AgentHistoryStore): HandlerFn {
  return (input: Record<string, unknown>) => {
    const filter: AgentHistoryFilter = {}
    const allProjects = input.allProjects === "1" || input.allProjects === true || input.allProjects === 1
    const requestedProject = typeof input.projectRoot === "string" && input.projectRoot ? input.projectRoot : undefined

    if (!allProjects) {
      const defaultProject = getDaemonProjectRoot()
      const finalProject = requestedProject ?? defaultProject ?? undefined
      if (finalProject) {
        filter.projectRoot = finalProject
      }
    } else if (requestedProject) {
      // allProjects disables default project scoping, but explicit projectRoot still applies.
      filter.projectRoot = requestedProject
    }

    const since = parseFiniteNumber(input.since)
    if (since !== undefined) {
      filter.since = since
    }

    const limit = parseFiniteNumber(input.limit)
    if (limit !== undefined && limit > 0) {
      filter.limit = Math.trunc(limit)
    }

    const entries = store.query(filter)
    return { entries, count: entries.length }
  }
}
