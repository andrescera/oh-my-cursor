import { mkdir, writeFile, readFile } from "node:fs/promises"
import { join } from "node:path"

const CONTEXT_FILE = ".cursor/rules/oh-my-cursor-context.mdc"

interface ContextState {
  sessionId: string
  projectDir: string
  activeAgents: string[]
  recentTools: string[]
  lastUpdated: string
}

async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true })
}

export async function writeContextRule(
  projectDir: string,
  state: ContextState,
): Promise<void> {
  const rulesDir = join(projectDir, ".cursor", "rules")
  await ensureDir(rulesDir)

  const content = [
    "---",
    'description: "oh-my-cursor dynamic context (auto-updated by hook daemon)"',
    "alwaysApply: true",
    "---",
    "",
    "# oh-my-cursor Session Context",
    "",
    `Session: ${state.sessionId}`,
    `Last updated: ${state.lastUpdated}`,
    "",
    "## Active Session State",
    "",
    state.activeAgents.length > 0
      ? `Active agents: ${state.activeAgents.join(", ")}`
      : "No active agents",
    "",
    state.recentTools.length > 0
      ? `Recent tool activity: ${state.recentTools.slice(-5).join(", ")}`
      : "",
    "",
    "## Orchestration Reminders",
    "",
    "- Follow the orchestrator rule for all delegation",
    "- Use the 6-section task brief format for every Task dispatch",
    "- Batch related searches into single explore dispatches",
    "- Executors self-verify before reporting done",
    "",
  ].join("\n")

  await writeFile(join(projectDir, CONTEXT_FILE), content, "utf-8")
}

export async function readContextState(projectDir: string): Promise<ContextState | null> {
  try {
    const content = await readFile(join(projectDir, CONTEXT_FILE), "utf-8")
    const sessionMatch = content.match(/Session: (.+)/)
    return {
      sessionId: sessionMatch?.[1] || "unknown",
      projectDir,
      activeAgents: [],
      recentTools: [],
      lastUpdated: new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export async function clearContextRule(projectDir: string): Promise<void> {
  const { unlink } = await import("node:fs/promises")
  try {
    await unlink(join(projectDir, CONTEXT_FILE))
  } catch {
    // file doesn't exist, that's fine
  }
}
