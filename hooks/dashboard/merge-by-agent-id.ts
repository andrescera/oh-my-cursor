export type RunningRow = { agentId: string; [key: string]: unknown }

export function mergeByAgentId<T extends RunningRow>(prev: T[], next: T[]): T[] {
  const byAgentId = new Map<string, T>()
  for (const row of prev) {
    byAgentId.set(row.agentId, row)
  }
  for (const row of next) {
    byAgentId.set(row.agentId, row)
  }
  for (const [id, row] of byAgentId) {
    if (typeof id === "string" && id.startsWith("pending-")) {
      const type = (row.agentType as string) || ""
      const hasRealOfSameType = Array.from(byAgentId.values()).some(
        (r) => r.agentId !== id && r.agentType === type && !String(r.agentId).startsWith("pending-")
      )
      if (hasRealOfSameType) byAgentId.delete(id)
    }
  }
  return Array.from(byAgentId.values())
}
