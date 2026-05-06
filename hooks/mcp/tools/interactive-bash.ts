import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { wrapToolHandler } from "../validate"
import { spawnWithTimeout } from "../../lib/spawn-with-timeout"

const inputSchema = {
  command: z.string().describe("The command to execute in the tmux session"),
  session_name: z
    .string()
    .optional()
    .describe("Name of the tmux session (default: oh-my-cursor)"),
}

const HAS_SESSION_TIMEOUT_MS = 200
const NEW_SESSION_TIMEOUT_MS = 500
const SEND_KEYS_TIMEOUT_MS = 200
const CAPTURE_TIMEOUT_MS = 500
const CAPTURE_MAX_BYTES = 256 * 1024

const TMUX_UNAVAILABLE = {
  content: [
    {
      type: "text" as const,
      text: "tmuxUnavailable: tmux binary not found or not responding. Install tmux: apt install tmux / brew install tmux",
    },
  ],
}

function tmuxTimeoutResponse(timeoutMs: number) {
  return {
    content: [
      {
        type: "text" as const,
        text: `tmuxTimeout: tmux operation timed out after ${timeoutMs}ms`,
      },
    ],
  }
}

function isTmuxMissing(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  if (err.message.includes("ENOENT")) return true
  const code = "code" in err ? (err as { code?: string }).code : undefined
  return code === "ENOENT"
}

interface HandlerArgs {
  command: string
  session_name?: string
}

export function createInteractiveBash(
  spawn: typeof spawnWithTimeout = spawnWithTimeout,
) {
  return async function handleInteractiveBash(args: HandlerArgs) {
    const command = args.command
    const sessionName = args.session_name ?? "oh-my-cursor"

    try {
      const checkSession = await spawn(
        ["tmux", "has-session", "-t", sessionName],
        { timeoutMs: HAS_SESSION_TIMEOUT_MS },
      )
      if (checkSession.timedOut) return tmuxTimeoutResponse(HAS_SESSION_TIMEOUT_MS)
      if (checkSession.exitCode === null) return TMUX_UNAVAILABLE

      if (checkSession.exitCode !== 0) {
        const created = await spawn(
          ["tmux", "new-session", "-d", "-s", sessionName],
          { timeoutMs: NEW_SESSION_TIMEOUT_MS },
        )
        if (created.timedOut) return tmuxTimeoutResponse(NEW_SESSION_TIMEOUT_MS)
        if (created.exitCode === null) return TMUX_UNAVAILABLE
      }

      const sent = await spawn(
        ["tmux", "send-keys", "-t", sessionName, command, "Enter"],
        { timeoutMs: SEND_KEYS_TIMEOUT_MS },
      )
      if (sent.timedOut) return tmuxTimeoutResponse(SEND_KEYS_TIMEOUT_MS)

      await Bun.sleep(500)

      const capture = await spawn(
        ["tmux", "capture-pane", "-t", sessionName, "-p", "-S", "-50"],
        { timeoutMs: CAPTURE_TIMEOUT_MS, maxOutputBytes: CAPTURE_MAX_BYTES },
      )
      if (capture.timedOut) return tmuxTimeoutResponse(CAPTURE_TIMEOUT_MS)

      return {
        content: [
          {
            type: "text" as const,
            text: `Session: ${sessionName}\nCommand: ${command}\n\nOutput:\n${capture.stdout}`,
          },
        ],
      }
    } catch (err) {
      if (isTmuxMissing(err)) return TMUX_UNAVAILABLE
      return {
        content: [
          {
            type: "text" as const,
            text: `tmux error: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
      }
    }
  }
}

export function register(server: McpServer): void {
  const handler = createInteractiveBash()
  server.registerTool(
    "interactive_bash",
    {
      description:
        "Execute commands in a persistent tmux session. Use for long-running processes, interactive commands, or when you need persistent terminal state across multiple calls.",
      inputSchema,
    },
    wrapToolHandler("interactive_bash", (args: HandlerArgs) => handler(args)),
  )
}
