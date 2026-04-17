export type EvidenceRecord = {
  experiment_id: string
  event: string
  hook_event_name: string
  conversation_id: string
  session_id: string
  pid: number
  ppid: number
  cwd: string
  env_cursor: Record<string, string>
  stdin_hash: string
  stdin_content_path: string
  stdin_preview: string
  stdout: string
  stderr: string
  exit_code: number
  started_at: string
  finished_at: string
  duration_ms: number
  schema_version: "v2"
}
