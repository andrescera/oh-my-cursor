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
  } catch (err) {
    console.error("[oh-my-cursor] Failed to read context state:", err)
    return null
  }
}

const SKILL_KEYWORD_MAP: ReadonlyArray<{ keywords: RegExp; skill: string }> = [
  { keywords: /\b(git|commit|rebase|merge|cherry-pick|stash)\b/i, skill: "git-master" },
  { keywords: /\b(browser|scrape|navigate|webpage|screenshot)\b/i, skill: "dev-browser" },
  { keywords: /\b(review|audit|quality)\b/i, skill: "review-work" },
  { keywords: /\b(frontend|ui|ux|design|component|layout)\b/i, skill: "frontend-ui-ux" },
  { keywords: /\b(playwright|e2e|end-to-end)\b/i, skill: "playwright" },
  { keywords: /\b(ai slop|narration comments|clean comments)\b/i, skill: "ai-slop-remover" },
  { keywords: /(?:\brule\b|\bcursor rule\b|\.cursor\/rules)/i, skill: "create-rule" },
]

export function matchSkills(context: string): string[] {
  const matched = new Set<string>()
  for (const { keywords, skill } of SKILL_KEYWORD_MAP) {
    if (keywords.test(context)) {
      matched.add(skill)
    }
  }
  return [...matched]
}

export async function clearContextRule(projectDir: string): Promise<void> {
  const { unlink } = await import("node:fs/promises")
  try {
    await unlink(join(projectDir, CONTEXT_FILE))
  } catch {
    // file doesn't exist, that's fine
  }
}
