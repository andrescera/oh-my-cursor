export type RunningRow = { agentId: string; [key: string]: unknown }

export function mergeByAgentId<T extends RunningRow>(prev: T[], next: T[]): T[] {
  const byAgentId = new Map<string, T>()
  for (const row of prev) {
    byAgentId.set(row.agentId, row)
  }
  for (const row of next) {
    byAgentId.set(row.agentId, row)
  }
  return Array.from(byAgentId.values())
}
