export const HookTier = {
  SESSION: 0,
  TOOL_GUARD: 1,
  TRANSFORM: 2,
  CONTINUATION: 3,
  SKILL: 4,
} as const

export type HookTierValue = (typeof HookTier)[keyof typeof HookTier]

export const HOOK_TIER_ASSIGNMENTS: Record<string, number> = {
  "/health": HookTier.SESSION,
  "/sessionStart": HookTier.SESSION,
  "/sessionEnd": HookTier.SESSION,
  "/preCompact": HookTier.SESSION,
  "/heartbeat": HookTier.SESSION,
  "/config": HookTier.SESSION,
  "/sessionHistory": HookTier.SESSION,
  "/backgroundTasks": HookTier.SESSION,
  "/subagentStart": HookTier.SESSION,
  "/subagentStop": HookTier.SESSION,

  "/preToolUse": HookTier.TOOL_GUARD,
  "/postToolUse": HookTier.TOOL_GUARD,
  "/postToolUseFailure": HookTier.TOOL_GUARD,
  "/beforeShellExecution": HookTier.TOOL_GUARD,
  "/afterShellExecution": HookTier.TOOL_GUARD,
  "/beforeReadFile": HookTier.TOOL_GUARD,
  "/afterFileEdit": HookTier.TOOL_GUARD,
  "/beforeMCPExecution": HookTier.TOOL_GUARD,
  "/afterMCPExecution": HookTier.TOOL_GUARD,

  "/afterAgentResponse": HookTier.TRANSFORM,
  "/afterAgentThought": HookTier.TRANSFORM,

  "/stop": HookTier.CONTINUATION,
  "/beforeSubmitPrompt": HookTier.CONTINUATION,
}

export function getHookTier(hookName: string): number {
  const normalized = hookName.startsWith("/") ? hookName : `/${hookName}`
  return HOOK_TIER_ASSIGNMENTS[normalized] ?? -1
}
