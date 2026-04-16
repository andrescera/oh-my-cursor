import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

const inputSchema = {
  command: z.string().describe("The command to execute in the tmux session"),
  session_name: z
    .string()
    .optional()
    .describe("Name of the tmux session (default: oh-my-cursor)"),
}

export function register(server: McpServer): void {
  server.registerTool(
    "interactive_bash",
    {
      description:
        "Execute commands in a persistent tmux session. Use for long-running processes, interactive commands, or when you need persistent terminal state across multiple calls.",
      inputSchema,
    },
    async (args) => {
      const command = args.command
      const sessionName = args.session_name ?? "oh-my-cursor"

      try {
        const checkSession = Bun.spawnSync(["tmux", "has-session", "-t", sessionName])

        if (checkSession.exitCode !== 0) {
          Bun.spawnSync(["tmux", "new-session", "-d", "-s", sessionName])
        }

        Bun.spawnSync(["tmux", "send-keys", "-t", sessionName, command, "Enter"])

        await Bun.sleep(500)

        const capture = Bun.spawnSync([
          "tmux",
          "capture-pane",
          "-t",
          sessionName,
          "-p",
          "-S",
          "-50",
        ])

        const output = capture.stdout.toString()

        return {
          content: [
            {
              type: "text",
              text: `Session: ${sessionName}\nCommand: ${command}\n\nOutput:\n${output}`,
            },
          ],
        }
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `tmux error: ${err instanceof Error ? err.message : String(err)}\n\nEnsure tmux is installed: apt install tmux / brew install tmux`,
            },
          ],
        }
      }
    },
  )
}
