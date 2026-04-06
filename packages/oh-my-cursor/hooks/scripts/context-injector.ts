import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"

import { loadConfig } from "../config"

const CONTEXT_FILE = ".cursor/rules/oh-my-cursor-context.mdc"

const lastWriteTimes = new Map<string, number>()

interface ContextState {
  sessionId: string
  projectDir: string
  activeAgents: string[]
  recentTools: string[]
  lastUpdated: string
  toolCallCount?: number
  errorCount?: number
  compactionEpoch?: number
  dispatchSummary?: Record<string, number>
}

async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true })
}

export async function writeContextRule(
  projectDir: string,
  state: ContextState,
): Promise<void> {
  const config = loadConfig()
  if (!config.mdc_writer.enabled) return

  const now = Date.now()
  const debounceMs = config.mdc_writer.debounce_ms
  const lastWrite = lastWriteTimes.get(projectDir) ?? 0
  if (lastWrite > 0 && now - lastWrite < debounceMs) {
    return
  }
  lastWriteTimes.set(projectDir, now)

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
    "## Session Metrics",
    "",
    `Tool calls: ${state.toolCallCount ?? 0}`,
    `Errors: ${state.errorCount ?? 0}`,
    `Compaction epoch: ${state.compactionEpoch ?? 0}`,
    "",
    "## Dispatch Summary",
    "",
    ...(state.dispatchSummary && Object.keys(state.dispatchSummary).length > 0
      ? Object.entries(state.dispatchSummary).map(([key, count]) => `- ${key}: ${count}`)
      : ["No dispatches yet"]),
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

export async function clearContextRule(projectDir: string): Promise<void> {
  lastWriteTimes.delete(projectDir)
  const { unlink } = await import("node:fs/promises")
  try {
    await unlink(join(projectDir, CONTEXT_FILE))
  } catch {
    // file doesn't exist, that's fine
  }
}
