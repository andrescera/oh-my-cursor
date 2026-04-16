import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { wrapToolHandler } from "../validate"

const inputSchema = {
  file_path: z.string().optional().describe("Absolute path to the file to analyze"),
  goal: z.string().describe("What specific information to extract from the file"),
}

export function register(server: McpServer): void {
  server.registerTool(
    "look_at",
    {
      description:
        "Analyze a file visually (images, PDFs, diagrams) or extract specific information from a file. Use when you need to understand visual content that cannot be read as plain text.",
      inputSchema,
    },
    wrapToolHandler("look_at", async (args) => {
      const filePath = args.file_path
      const goal = args.goal

      if (!filePath) {
        return {
          content: [
            {
              type: "text",
              text: "No file_path provided. Use the Read tool with image support, or provide a file path for analysis.",
            },
          ],
        }
      }

      const ext = filePath.split(".").pop()?.toLowerCase()
      const isImage = ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext || "")
      const isPdf = ext === "pdf"

      if (isImage) {
        const file = Bun.file(filePath)
        if (!(await file.exists())) {
          return { content: [{ type: "text", text: `File not found: ${filePath}` }] }
        }
        const buffer = await file.arrayBuffer()
        const base64 = Buffer.from(buffer).toString("base64")
        const mimeType = `image/${ext === "jpg" ? "jpeg" : ext}`

        return {
          content: [
            { type: "text", text: `Analyzing image for: ${goal}` },
            { type: "text", text: `[Image data: ${base64.length} bytes base64, ${mimeType}]` },
            {
              type: "text",
              text: "Note: For full image analysis, use Cursor's native Read tool which supports images directly.",
            },
          ],
        }
      }

      if (isPdf) {
        return {
          content: [
            {
              type: "text",
              text: `PDF analysis requested for: ${filePath}\nGoal: ${goal}\n\nUse Cursor's native Read tool which supports PDF files directly.`,
            },
          ],
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `File type .${ext} - use Cursor's Read tool for text files, or provide an image/PDF path for visual analysis.`,
          },
        ],
      }
    }),
  )
}
