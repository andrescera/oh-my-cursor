#!/usr/bin/env bun
/**
 * Config Generator: oh-my-opencode JSONC -> .cursor-plugin/
 *
 * Reads an oh-my-opencode JSONC config file and generates a Cursor plugin
 * directory structure with agents, rules, and settings derived from it.
 *
 * Usage:
 *   bun run scripts/config-generator.ts [config-path] [output-dir]
 *   bun run scripts/config-generator.ts .opencode/oh-my-opencode.jsonc ./output
 *   bun run scripts/config-generator.ts --sync-rules
 *
 * --sync-rules regenerates ONLY the marker-delimited routing/model-enum tables
 * in rules/orchestrator.mdc and rules/agent-tool-restrictions.mdc. It is an
 * explicit CLI mode only — never a daemon side effect.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises"
import { readFileSync, writeFileSync, readdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { KNOWN_CURSOR_MODELS } from "../hooks/lib/known-models"
import { loadReported } from "../hooks/lib/reported-models-store"
import { resolveCursorVersion } from "../hooks/lib/task-schema-introspector"

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(SCRIPT_DIR, "..")
const AGENTS_DIR = join(REPO_ROOT, "agents")
const RULES_DIR = join(REPO_ROOT, "rules")

function stripJsonComments(text: string): string {
  let result = ""
  let i = 0
  while (i < text.length) {
    if (text[i] === '"') {
      result += '"'
      i++
      while (i < text.length && text[i] !== '"') {
        if (text[i] === '\\' && i + 1 < text.length) {
          result += text[i] + text[i + 1]
          i += 2
        } else {
          result += text[i]
          i++
        }
      }
      if (i < text.length) {
        result += '"'
        i++
      }
    } else if (text[i] === '/' && i + 1 < text.length && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++
    } else if (text[i] === '/' && i + 1 < text.length && text[i + 1] === '*') {
      i += 2
      while (i + 1 < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++
      if (i + 1 < text.length) i += 2
    } else {
      result += text[i]
      i++
    }
  }
  return result
}

interface OhMyOpenCodeConfig {
  disabled_agents?: string[]
  disabled_skills?: string[]
  disabled_hooks?: string[]
  disabled_commands?: string[]
  disabled_tools?: string[]
  agents?: Record<string, AgentOverride>
  categories?: Record<string, CategoryConfig>
  ralph_loop?: { max_iterations?: number }
  background_task?: { max_concurrent?: number }
  websearch?: { provider?: string }
  [key: string]: unknown
}

interface AgentOverride {
  model?: string
  variant?: string
  temperature?: number
  prompt_append?: string
  fallback_models?: string[]
  [key: string]: unknown
}

interface CategoryConfig {
  model?: string
  description?: string
  [key: string]: unknown
}

/**
 * Single fallback source of truth for valid Cursor Task model slugs. Imported
 * from hooks/lib/known-models.ts (KNOWN_CURSOR_MODELS) rather than re-declared
 * locally, so config-generator, the daemon, and the introspector all share one
 * superset rather than duplicating hardcoded enums. A Set is built here only for
 * O(1) membership checks inside mapModel().
 */
const KNOWN_SLUG_SET = new Set<string>(KNOWN_CURSOR_MODELS)

/**
 * Maps oh-my-opencode model identifiers to valid Cursor Task model slugs.
 * Cursor's Task tool only accepts enum-enforced slugs; the authoritative
 * fallback list is KNOWN_CURSOR_MODELS in hooks/lib/known-models.ts.
 */
const MODEL_MAP: Record<string, string> = {
  "claude-opus-4-6": "claude-opus-4-7-thinking-xhigh",
  "claude-opus-4-7": "claude-opus-4-7-thinking-xhigh",
  "claude-sonnet-4-6": "claude-4.6-sonnet-medium-thinking",
  "claude-haiku-4-5": "composer-2-fast",
  "gpt-5.4": "gpt-5.4-medium",
  "gpt-5.4-high": "gpt-5.5-extra-high",
  "gpt-5-nano": "composer-2-fast",
  "gemini-3.1-pro": "gemini-3.1-pro",
  "gemini-2.5-flash": "composer-2-fast",
  "gemini-3-flash": "composer-2-fast",
  "kimi-k2.5": "composer-2-fast",
}

export function mapModel(openCodeModel: string, variant?: string): string {
  if (openCodeModel === "fast") {
    throw new Error(
      "Input model 'fast' is no longer accepted. Use 'composer-2-fast' explicitly.",
    )
  }
  const base =
    MODEL_MAP[openCodeModel] ??
    Object.keys(MODEL_MAP)
      .sort((a, b) => b.length - a.length)
      .reduce<string | undefined>(
        (found, key) => found ?? (openCodeModel.includes(key) ? MODEL_MAP[key] : undefined),
        undefined,
      ) ??
    openCodeModel
  if (variant) {
    const parts = base.split("-")
    const levelIdx = parts.findIndex((p) => ["medium", "high", "low", "max"].includes(p))
    if (levelIdx !== -1) {
      parts[levelIdx] = variant
      const variantResult = parts.join("-")
      const remapped = MODEL_MAP[variantResult] ?? variantResult
      if (KNOWN_SLUG_SET.has(remapped)) {
        return remapped
      }
      return base
    }
  }
  return base
}

// Non-agent `protocols/` subdir is excluded by the `.md` filter; sorted for
// deterministic (idempotent) --sync-rules output.
function scanDefaultAgents(agentsDir: string = AGENTS_DIR): string[] {
  return readdirSync(agentsDir)
    .filter((entry) => entry.endsWith(".md"))
    .map((entry) => entry.slice(0, -".md".length))
    .sort()
}

async function generatePlugin(configPath: string, outputDir: string): Promise<void> {
  console.log(`[config-generator] Reading: ${configPath}`)
  const raw = await readFile(configPath, "utf-8")
  const config: OhMyOpenCodeConfig = JSON.parse(stripJsonComments(raw))

  const disabledAgents = new Set(config.disabled_agents || [])
  const disabledSkills = new Set(config.disabled_skills || [])
  const disabledCommands = new Set(config.disabled_commands || [])

  await mkdir(join(outputDir, ".cursor-plugin"), { recursive: true })
  await mkdir(join(outputDir, "agents"), { recursive: true })
  await mkdir(join(outputDir, "rules"), { recursive: true })

  const manifest = {
    name: "oh-my-cursor",
    version: "0.1.0",
    description: "Multi-agent orchestration for Cursor (generated from oh-my-opencode config)",
    author: { name: "oh-my-openagent contributors" },
    license: "SUL-1.0",
  }
  await writeFile(
    join(outputDir, ".cursor-plugin", "plugin.json"),
    JSON.stringify(manifest, null, 2),
    "utf-8",
  )
  console.log("[config-generator] Created plugin.json")

  const enabledAgents = scanDefaultAgents().filter((a) => !disabledAgents.has(a))
  const agentOverrides = config.agents || {}

  for (const agentName of enabledAgents) {
    const override = agentOverrides[agentName] || {}
    const model = override.model ? mapModel(override.model, override.variant) : undefined
    const promptAppend = override.prompt_append || ""

    const lines = [
      "---",
      `name: ${agentName}`,
      `description: "${agentName} agent (generated from oh-my-opencode config)"`,
    ]
    if (model) lines.push(`model: ${model}`)
    lines.push("---", "", `# ${agentName}`, "")
    if (promptAppend) {
      lines.push(promptAppend, "")
    }
    lines.push(`This agent was generated from oh-my-opencode config. See the full agent definition in agents/${agentName}.md for the complete prompt.`)

    await writeFile(
      join(outputDir, "agents", `${agentName}.md`),
      lines.join("\n"),
      "utf-8",
    )
  }
  console.log(`[config-generator] Created ${enabledAgents.length} agent stubs`)

  if (config.ralph_loop?.max_iterations) {
    const hookOverride = {
      version: 1,
      hooks: {
        stop: [{
          command: "curl -s -X POST http://localhost:${OH_MY_CURSOR_DAEMON_PORT:-27847}/stop -H 'Content-Type: application/json' -d \"$(cat)\"",
          loop_limit: config.ralph_loop.max_iterations,
        }],
      },
    }
    await writeFile(
      join(outputDir, "hooks-override.json"),
      JSON.stringify(hookOverride, null, 2),
      "utf-8",
    )
    console.log(`[config-generator] Created hooks-override.json (loop_limit: ${config.ralph_loop.max_iterations})`)
  }

  const disabledList = [
    ...Array.from(disabledAgents).map((a) => `agent: ${a}`),
    ...Array.from(disabledSkills).map((s) => `skill: ${s}`),
    ...Array.from(disabledCommands).map((c) => `command: ${c}`),
  ]

  if (disabledList.length > 0) {
    const disabledRule = [
      "---",
      'description: "Disabled components from oh-my-opencode config"',
      "alwaysApply: true",
      "---",
      "",
      "# Disabled Components",
      "",
      "The following components are disabled by configuration:",
      "",
      ...disabledList.map((item) => `- ${item}`),
      "",
      "Do NOT use or delegate to disabled agents. Do NOT invoke disabled commands.",
    ].join("\n")

    await mkdir(join(outputDir, "rules"), { recursive: true })
    await writeFile(
      join(outputDir, "rules", "disabled-components.mdc"),
      disabledRule,
      "utf-8",
    )
    console.log(`[config-generator] Created disabled-components.mdc (${disabledList.length} items)`)
  }

  console.log(`[config-generator] Done. Output: ${outputDir}`)
}

const ROUTING_START = "<!-- omc:routing-table:start -->"
const ROUTING_END = "<!-- omc:routing-table:end -->"
const MODEL_ENUM_START = "<!-- omc:model-enum:start -->"
const MODEL_ENUM_END = "<!-- omc:model-enum:end -->"

const ROUTING_HEADER_COMMENT =
  "<!-- Generated by config-generator.ts --sync-rules. Hook-time enforcement (composer) is CANONICAL; this table is informative for the root thread. -->"
const MODEL_ENUM_HEADER_COMMENT =
  "<!-- Generated by config-generator.ts --sync-rules. Sourced from the runtime-reported model capture for the current Cursor version when available, else the hooks/lib/known-models.ts KNOWN_CURSOR_MODELS fallback. Hook-time enforcement (composer) is CANONICAL; this table is informative for the root thread. -->"

// Match header row + separator row + body rows, stopping BEFORE the final
// trailing newline so the blank line after the table survives marker wrapping.
const ORCH_TABLE_RE =
  /\| *Agent *\| *Model *\|[^\n]*\n\| *[-:][^\n]*\n(?:\|[^\n]*\n)*\|[^\n]*/
const ENUM_TABLE_RE =
  /\| *Slug *\| *Tier *\|[^\n]*\n\| *[-:][^\n]*\n(?:\|[^\n]*\n)*\|[^\n]*/

interface AgentMeta {
  name: string
  model: string
  role: string
}

function firstSentence(text: string): string {
  const idx = text.search(/\.(\s|$)/)
  return (idx >= 0 ? text.slice(0, idx) : text).trim()
}

function parseAgentFrontmatter(agentsDir: string, name: string): AgentMeta {
  const raw = readFileSync(join(agentsDir, `${name}.md`), "utf-8")
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/)
  const fm = fmMatch ? fmMatch[1] : ""
  const model = (fm.match(/^model:\s*(.+)$/m)?.[1] ?? "").trim()
  const descRaw = (fm.match(/^description:\s*(.+)$/m)?.[1] ?? "").trim()
  const desc = descRaw.replace(/^["']|["']$/g, "")
  return { name, model, role: firstSentence(desc) }
}

function buildRoutingTable(agents: readonly AgentMeta[]): string {
  const header = "| Agent | Model | Role |\n|-------|-------|------|"
  const rows = agents.map((a) => `| **${a.name}** | \`${a.model}\` | ${a.role} |`)
  return [header, ...rows].join("\n")
}

function tierForSlug(slug: string): string {
  if (slug.includes("gemini")) return "Multimodal"
  if (slug.includes("xhigh") || slug.includes("extra-high")) return "Heavy+"
  if (slug.includes("opus") || slug.includes("gpt-5.5")) return "Heavy+"
  if (slug.includes("fast")) return "Standard"
  if (slug.includes("sonnet") || slug.includes("gpt-5.4-high") || slug.includes("medium-thinking"))
    return "Standard+"
  return "Standard"
}

function buildModelEnumTable(slugs: readonly string[]): string {
  const header = "| Slug | Tier |\n| --- | --- |"
  const rows = slugs.map((s) => `| \`${s}\` | ${tierForSlug(s)} |`)
  return [header, ...rows].join("\n")
}

/**
 * Synchronous enum source for the model-enum table: a runtime-reported capture
 * for the live Cursor version when one exists, otherwise the KNOWN_CURSOR_MODELS
 * fallback. Resolves the version via the shared introspector helper and loads
 * the reported store directly (both sync, never-throwing) so --sync-rules stays
 * synchronous and does not bundle-scan.
 */
export function resolveEnumForGenerator(): readonly string[] {
  const version = resolveCursorVersion()
  if (version) {
    const reported = loadReported(version)
    if (reported) return reported.models
  }
  return KNOWN_CURSOR_MODELS
}

function buildMarkedBlock(start: string, end: string, headerComment: string, table: string): string {
  return `${start}\n${headerComment}\n\n${table}\n${end}`
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

// First run (markers absent): wrap the table located by `locateExisting`.
// Subsequent runs: replace only between the markers. Function replacer keeps
// `$`-sequences in `block` literal.
function syncSection(
  content: string,
  start: string,
  end: string,
  block: string,
  locateExisting: RegExp,
  label: string,
): string {
  const hasStart = content.includes(start)
  const hasEnd = content.includes(end)
  if (hasStart && hasEnd) {
    const re = new RegExp(escapeRegExp(start) + "[\\s\\S]*?" + escapeRegExp(end))
    return content.replace(re, () => block)
  }
  if (hasStart !== hasEnd) {
    throw new Error(`[sync-rules] ${label}: exactly one marker present; refusing to proceed`)
  }
  if (!locateExisting.test(content)) {
    throw new Error(`[sync-rules] ${label}: could not locate existing table to wrap with markers`)
  }
  return content.replace(locateExisting, () => block)
}

function syncRules(): void {
  const agents = scanDefaultAgents().map((name) => parseAgentFrontmatter(AGENTS_DIR, name))

  const routingBlock = buildMarkedBlock(
    ROUTING_START,
    ROUTING_END,
    ROUTING_HEADER_COMMENT,
    buildRoutingTable(agents),
  )
  const orchPath = join(RULES_DIR, "orchestrator.mdc")
  const orchContent = readFileSync(orchPath, "utf-8")
  const orchUpdated = syncSection(
    orchContent,
    ROUTING_START,
    ROUTING_END,
    routingBlock,
    ORCH_TABLE_RE,
    "orchestrator.mdc routing table",
  )
  if (orchUpdated !== orchContent) {
    writeFileSync(orchPath, orchUpdated, "utf-8")
    console.log("[config-generator] Updated orchestrator.mdc routing table")
  } else {
    console.log("[config-generator] orchestrator.mdc routing table already up to date")
  }

  const enumBlock = buildMarkedBlock(
    MODEL_ENUM_START,
    MODEL_ENUM_END,
    MODEL_ENUM_HEADER_COMMENT,
    buildModelEnumTable(resolveEnumForGenerator()),
  )
  const restrPath = join(RULES_DIR, "agent-tool-restrictions.mdc")
  const restrContent = readFileSync(restrPath, "utf-8")
  const restrUpdated = syncSection(
    restrContent,
    MODEL_ENUM_START,
    MODEL_ENUM_END,
    enumBlock,
    ENUM_TABLE_RE,
    "agent-tool-restrictions.mdc model-enum table",
  )
  if (restrUpdated !== restrContent) {
    writeFileSync(restrPath, restrUpdated, "utf-8")
    console.log("[config-generator] Updated agent-tool-restrictions.mdc model-enum table")
  } else {
    console.log("[config-generator] agent-tool-restrictions.mdc model-enum table already up to date")
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2)

  if (args.includes("--sync-rules")) {
    try {
      syncRules()
    } catch (err) {
      console.error("[config-generator] Error:", err)
      process.exit(1)
    }
  } else {
    const configPath = args[0] || ".opencode/oh-my-opencode.jsonc"
    const outputDir = args[1] || "./generated-plugin"

    generatePlugin(configPath, outputDir).catch((err) => {
      console.error("[config-generator] Error:", err)
      process.exit(1)
    })
  }
}
