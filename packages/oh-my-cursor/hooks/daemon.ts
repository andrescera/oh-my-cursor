import { serve } from "bun"

const PORT = parseInt(process.env.OH_MY_CURSOR_PORT || "47847")

type SessionState = {
  id: string
  startedAt: string
  env: Record<string, string>
  dispatchCounts: Record<string, number>
  contextHistory: string[]
}

const sessions = new Map<string, SessionState>()

function getOrCreateSession(conversationId: string): SessionState {
  if (!sessions.has(conversationId)) {
    sessions.set(conversationId, {
      id: conversationId,
      startedAt: new Date().toISOString(),
      env: {},
      dispatchCounts: {},
      contextHistory: [],
    })
  }
  return sessions.get(conversationId)!
}

function parseInput(body: unknown): Record<string, unknown> {
  if (typeof body === "string") return JSON.parse(body)
  return body as Record<string, unknown>
}

const handlers: Record<string, (input: Record<string, unknown>) => Record<string, unknown>> = {
  "/health": () => ({ status: "ok", sessions: sessions.size, uptime: process.uptime() }),

  "/sessionStart": (input) => {
    const convId = (input.conversation_id as string) || "unknown"
    const session = getOrCreateSession(convId)
    const workspaceRoots = (input.workspace_roots as string[]) || []
    const projectDir = workspaceRoots[0] || process.cwd()

    session.env.OH_MY_CURSOR_SESSION_ID = convId
    session.env.OH_MY_CURSOR_PROJECT_DIR = projectDir

    return {
      env: session.env,
      additional_context: [
        "## oh-my-cursor Context",
        "",
        `Session: ${convId}`,
        `Project: ${projectDir}`,
        `Started: ${session.startedAt}`,
        "",
        "You are operating within the oh-my-cursor multi-agent orchestration system.",
        "Follow the orchestrator rule for all task delegation.",
      ].join("\n"),
    }
  },

  "/sessionEnd": (input) => {
    const convId = (input.session_id as string) || (input.conversation_id as string) || "unknown"
    sessions.delete(convId)
    return {}
  },

  "/preToolUse": (input) => {
    const toolName = input.tool_name as string
    const convId = (input.conversation_id as string) || "unknown"
    const session = getOrCreateSession(convId)

    session.dispatchCounts[toolName] = (session.dispatchCounts[toolName] || 0) + 1

    return { permission: "allow" }
  },

  "/postToolUse": (input) => {
    const toolName = input.tool_name as string
    const convId = (input.conversation_id as string) || "unknown"
    const session = getOrCreateSession(convId)

    const contextNote = `[${new Date().toISOString()}] ${toolName} completed`
    session.contextHistory.push(contextNote)

    if (session.contextHistory.length > 50) {
      session.contextHistory = session.contextHistory.slice(-30)
    }

    return {
      additional_context: session.contextHistory.length % 10 === 0
        ? `[oh-my-cursor] Session activity: ${session.contextHistory.length} tool calls this session.`
        : undefined,
    }
  },

  "/postToolUseFailure": (input) => {
    const toolName = input.tool_name as string
    const errorMsg = input.error_message as string
    const failureType = input.failure_type as string
    console.error(`[oh-my-cursor] Tool failure: ${toolName} (${failureType}): ${errorMsg}`)
    return {}
  },

  "/subagentStart": (input) => {
    const subagentType = input.subagent_type as string
    const task = input.task as string
    const convId = (input.conversation_id as string) || "unknown"
    const session = getOrCreateSession(convId)

    const agentKey = `subagent:${subagentType}`
    session.dispatchCounts[agentKey] = (session.dispatchCounts[agentKey] || 0) + 1

    const exploreCount = session.dispatchCounts["subagent:explore"] || 0
    const juniorCount = session.dispatchCounts["subagent:generalPurpose"] || 0

    if (subagentType === "explore" && exploreCount > 5) {
      return {
        permission: "deny",
        user_message: `Explore dispatch limit reached (${exploreCount}/5). Batch queries into fewer dispatches.`,
      }
    }

    if (juniorCount > 8) {
      return {
        permission: "deny",
        user_message: `Worker dispatch limit reached (${juniorCount}/8). Wait for current workers to complete.`,
      }
    }

    return { permission: "allow" }
  },

  "/subagentStop": (input) => {
    const status = input.status as string
    const subagentType = input.subagent_type as string
    const summary = (input.summary as string) || ""
    const loopCount = (input.loop_count as number) || 0

    if (status === "error" && loopCount < 3) {
      return {
        followup_message: `Subagent ${subagentType} failed. Review the error and retry with adjusted context.`,
      }
    }

    return {}
  },

  "/beforeShellExecution": (input) => {
    const command = input.command as string

    const dangerousPatterns = [
      /rm\s+-rf\s+\//,
      /mkfs\./,
      /dd\s+if=/,
      />\s*\/dev\/sd/,
    ]

    for (const pattern of dangerousPatterns) {
      if (pattern.test(command)) {
        return {
          permission: "deny",
          user_message: "Dangerous command blocked by oh-my-cursor",
          agent_message: `Command blocked for safety: ${command}. Use a safer alternative.`,
        }
      }
    }

    return { permission: "allow" }
  },

  "/afterShellExecution": () => ({}),

  "/beforeMCPExecution": () => ({ permission: "allow" }),

  "/afterMCPExecution": () => ({}),

  "/beforeReadFile": (input) => {
    const filePath = input.file_path as string

    const sensitivePatterns = [/\.env\.local$/, /\.env\.production$/, /credentials\.json$/]
    for (const pattern of sensitivePatterns) {
      if (pattern.test(filePath)) {
        return {
          permission: "deny",
          user_message: `Access to sensitive file blocked: ${filePath}`,
        }
      }
    }

    return { permission: "allow" }
  },

  "/afterFileEdit": () => ({}),

  "/afterAgentResponse": () => ({}),

  "/afterAgentThought": (input) => {
    const durationMs = input.duration_ms as number
    if (durationMs && durationMs > 30000) {
      console.log(`[oh-my-cursor] Long thinking block: ${Math.round(durationMs / 1000)}s`)
    }
    return {}
  },

  "/preCompact": (input) => {
    const usagePercent = input.context_usage_percent as number
    return {
      user_message: usagePercent > 90
        ? `Context at ${usagePercent}%. Consider using /handoff to preserve context.`
        : undefined,
    }
  },

  "/stop": (input) => {
    const status = input.status as string
    const loopCount = (input.loop_count as number) || 0
    const convId = (input.conversation_id as string) || "unknown"
    const session = getOrCreateSession(convId)

    if (status === "completed" && session.contextHistory.length > 0) {
      const hasIncompleteTodos = session.contextHistory.some(
        (entry) => entry.includes("TodoWrite") || entry.includes("in_progress"),
      )

      if (hasIncompleteTodos && loopCount < 100) {
        return {
          followup_message:
            "There are incomplete todos remaining. Continue working on the next pending task. Check TodoRead for current state.",
        }
      }
    }

    if (status === "error" && loopCount < 3) {
      return {
        followup_message:
          "The previous attempt encountered an error. Review what went wrong and try a different approach.",
      }
    }

    return {}
  },

  "/beforeSubmitPrompt": () => ({ continue: true }),
}

console.log(`[oh-my-cursor] Hook daemon starting on port ${PORT}...`)

serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)
    const path = url.pathname

    const handler = handlers[path]
    if (!handler) {
      return new Response(JSON.stringify({ error: "unknown hook event" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    }

    try {
      const body = req.method === "POST" ? await req.json() : {}
      const result = handler(parseInput(body))
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
      })
    } catch (err) {
      console.error(`[oh-my-cursor] Hook error on ${path}:`, err)
      return new Response(JSON.stringify({}), {
        headers: { "Content-Type": "application/json" },
      })
    }
  },
})

console.log(`[oh-my-cursor] Hook daemon ready on http://localhost:${PORT}`)
