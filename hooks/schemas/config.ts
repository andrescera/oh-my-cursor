import { z } from "zod"

export const SubagentLimitsSchema = z.object({
  explore: z.number().default(6),
  worker: z.number().default(8),
})

export const StatePersistenceSchema = z.object({
  enabled: z.boolean().default(true),
  path: z.string().default("/tmp/oh-my-cursor-state.json"),
})

export const DaemonSchema = z.object({
  port: z.number().int().min(1024).max(65535).default(47847),
  mcp_port: z.number().int().min(1024).max(65535).default(47848),
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

export const MomusSchema = z.object({
  max_iterations: z.number().positive().default(3),
})

export const ModelRoutingSchema = z.object({
  retry_on_errors: z.array(z.number().int()).default([429, 500, 502, 503, 504]),
  max_retry_attempts: z.number().positive().default(3),
  defaults: z.record(z.string(), z.string()).default({
    explore: "fast",
    librarian: "fast",
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
  daemon: DaemonSchema.default({ port: 47847, mcp_port: 47848 }),
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
  momus: MomusSchema.default({ max_iterations: 3 }),
  model_routing: ModelRoutingSchema.default({
    retry_on_errors: [429, 500, 502, 503, 504],
    max_retry_attempts: 3,
    defaults: { explore: "fast", librarian: "fast" },
  }),
})

export type OhMyCursorConfig = z.infer<typeof OhMyCursorConfigSchema>

export const DEFAULT_CONFIG = OhMyCursorConfigSchema.parse({})
