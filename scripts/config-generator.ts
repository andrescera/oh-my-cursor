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
 */

import { readFile, writeFile, mkdir } from "node:fs/promises"
import { join, basename } from "node:path"

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

const MODEL_MAP: Record<string, string> = {
  "claude-opus-4-6": "claude-4.6-opus-max-thinking",
  "claude-sonnet-4-6": "claude-4.6-sonnet-medium-thinking",
  "claude-haiku-4-5": "fast",
  "gpt-5.4": "gpt-5.4-medium",
  "gpt-5-nano": "fast",
  "gemini-3.1-pro": "gemini-3.1-pro",
  "gemini-2.5-flash": "gemini-3-flash",
  "gemini-3-flash": "gemini-3-flash",
  "kimi-k2.5": "fast",
}

function mapModel(openCodeModel: string): string {
  if (MODEL_MAP[openCodeModel]) return MODEL_MAP[openCodeModel]
  const sortedKeys = Object.keys(MODEL_MAP).sort((a, b) => b.length - a.length)
  for (const key of sortedKeys) {
    if (openCodeModel.includes(key)) return MODEL_MAP[key]
  }
  return openCodeModel
}

const DEFAULT_AGENTS = [
  "sisyphus", "hephaestus", "oracle", "librarian", "explore",
  "multimodal-looker", "metis", "momus", "atlas", "prometheus",
  "sisyphus-junior",
]

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

  const enabledAgents = DEFAULT_AGENTS.filter((a) => !disabledAgents.has(a))
  const agentOverrides = config.agents || {}

  for (const agentName of enabledAgents) {
    const override = agentOverrides[agentName] || {}
    const model = override.model ? mapModel(override.model) : undefined
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
          command: "curl -s -X POST http://localhost:${OH_MY_CURSOR_DAEMON_PORT:-47847}/stop -H 'Content-Type: application/json' -d \"$(cat)\"",
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

const args = process.argv.slice(2)
const configPath = args[0] || ".opencode/oh-my-opencode.jsonc"
const outputDir = args[1] || "./generated-plugin"

generatePlugin(configPath, outputDir).catch((err) => {
  console.error("[config-generator] Error:", err)
  process.exit(1)
})
