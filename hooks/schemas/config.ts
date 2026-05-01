import { z } from "zod"

const DEFAULT_MAX_CONTINUATION_WALLCLOCK_MS = 3_600_000
const DEFAULT_MAX_CONSECUTIVE_ZERO_DELTAS = 3

export const SubagentLimitsSchema = z.object({
  explore: z.number().default(6),
  worker: z.number().default(8),
})

export const StatePersistenceSchema = z.object({
  enabled: z.boolean().default(true),
  path: z.string().default("/tmp/oh-my-cursor-state"),
})

export const DaemonSchema = z.object({
  port: z.number().int().min(1024).max(65535).default(27847),
  mcp_port: z.number().int().min(1024).max(65535).default(27848),
})

export const ContextCollectorSchema = z.object({
  enabled: z.boolean().default(true),
  max_context_chars: z.number().int().min(1000).max(500000).default(50000),
})

export const CompactionSchema = z.object({
  prompt_enabled: z.boolean().default(true),
  user_message_template: z.string().optional(),
})

export const ExperimentalSchema = z.object({
  cloud_agents: z.boolean().default(false),
  webhooks: z.boolean().default(false),
  automations: z.boolean().default(false),
})

export const NotificationsSchema = z.object({
  enabled: z.boolean().default(true),
  sound: z.boolean().default(false),
})

export const OrchestrationSchema = z.object({
  mode: z.enum(["native", "subagent"]).default("native"),
})

export const ContinuationSchema = z.object({
  cooldown_ms: z.number().positive().default(5000),
  max_failures: z.number().positive().default(5),
  backoff_multiplier: z.number().positive().default(2),
})

// Safety caps for the /stop continuation loop and the upstream Cursor MCP
// LLM review hook. The MCP flag is advisory only — the actual hook entry
// lives in hooks/hooks.json and is owned by Cursor's hook runtime, so the
// daemon cannot wrap it with a server-side timeout. See
// docs/internal/mcp-safety-hook.md for how to disable the hook entry.
export const SafetyContinuationSchema = z.object({
  max_wallclock_ms: z.number().int().positive().default(DEFAULT_MAX_CONTINUATION_WALLCLOCK_MS),
  max_consecutive_zero_deltas: z.number().int().positive().default(DEFAULT_MAX_CONSECUTIVE_ZERO_DELTAS),
})

export const SafetySchema = z.object({
  continuation: SafetyContinuationSchema.default({
    max_wallclock_ms: DEFAULT_MAX_CONTINUATION_WALLCLOCK_MS,
    max_consecutive_zero_deltas: DEFAULT_MAX_CONSECUTIVE_ZERO_DELTAS,
  }),
  mcp_llm_review_enabled: z.boolean().default(true),
})

export const MomusSchema = z.object({
  max_iterations: z.number().positive().default(4),
})

export const ModelRoutingSchema = z.object({
  retry_on_errors: z.array(z.number().int()).default([429, 500, 502, 503, 504]),
  max_retry_attempts: z.number().positive().default(3),
  defaults: z.record(z.string(), z.string()).default({
    explore: "composer-2-fast",
    librarian: "composer-2-fast",
  }),
})

export const OhMyCursorConfigSchema = z.object({
  version: z.number().default(1),
  disabled_hooks: z.array(z.string()).default([]),
  disabled_agents: z.array(z.string()).default([]),
  subagent_limits: SubagentLimitsSchema.default({ explore: 6, worker: 8 }),
  state_persistence: StatePersistenceSchema.default({
    enabled: true,
    path: "/tmp/oh-my-cursor-state.json",
  }),
  daemon: DaemonSchema.default({ port: 27847, mcp_port: 27848 }),
  context_collector: ContextCollectorSchema.default({ enabled: true, max_context_chars: 50000 }),
  compaction: CompactionSchema.default({ prompt_enabled: true }),
  experimental: ExperimentalSchema.default({
    cloud_agents: false,
    webhooks: false,
    automations: false,
  }),
  mcp_allowlist: z.array(z.string()).default(["*"]),
  notifications: NotificationsSchema.default({ enabled: true, sound: false }),
  orchestration: OrchestrationSchema.default({ mode: "native" }),
  continuation: ContinuationSchema.default({ cooldown_ms: 5000, max_failures: 5, backoff_multiplier: 2 }),
  safety: SafetySchema.default({
    continuation: { max_wallclock_ms: DEFAULT_MAX_CONTINUATION_WALLCLOCK_MS, max_consecutive_zero_deltas: DEFAULT_MAX_CONSECUTIVE_ZERO_DELTAS },
    mcp_llm_review_enabled: true,
  }),
  momus: MomusSchema.default({ max_iterations: 4 }),
  model_routing: ModelRoutingSchema.default({
    retry_on_errors: [429, 500, 502, 503, 504],
    max_retry_attempts: 3,
    defaults: { explore: "composer-2-fast", librarian: "composer-2-fast" },
  }),
})

export type OhMyCursorConfig = z.infer<typeof OhMyCursorConfigSchema>

export const DEFAULT_CONFIG = OhMyCursorConfigSchema.parse({})
