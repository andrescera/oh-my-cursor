export type WaveId = "C" | "D" | "AB" | "H" | "EK" | "F";
export type Decision =
  | "logger"
  | "deny"
  | "allow"
  | "ask"
  | "updated-input"
  | "additional-context"
  | "followup-message"
  | "env-inject"
  | "malformed-json"
  | "exit-2"
  | "user-message"
  | "agent-message";

export interface ExperimentCell {
  experiment_id: string;
  wave: WaveId;
  event: string;
  decision: Decision;
  matcher: string;
  sentinel: string | null;
  needs_gate: boolean;
  command: string;
  responder_args: string[];
  timeout?: number;
  failClosed?: boolean;
  loop_limit?: number | null;
  type?: "command" | "prompt";
  prompt?: string;
  model?: string;
  expected_outcome: string;
}

export interface ExperimentRegistry {
  generated_at: string;
  mega_config_path: string;
  header_ref: string;
  cells: ExperimentCell[];
}
