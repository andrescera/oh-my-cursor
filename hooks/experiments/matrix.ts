import type { ExperimentCell, ExperimentRegistry, WaveId, Decision } from "./matrix-types";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO = "<REPO>";
const SCRIPTS = `${REPO}/hooks/scripts`;
const EXPERIMENTS = `${REPO}/hooks/experiments`;
const RESPONDERS = `${EXPERIMENTS}/responders`;
const SENTINEL_GATE = `${EXPERIMENTS}/sentinel-gate.sh`;
const LOGGER_V2 = `${SCRIPTS}/experiment-logger-v2.sh`;

const KNOWN_GOOD_EVENTS = new Set([
  "beforeShellExecution", "beforeMCPExecution", "afterShellExecution", "afterMCPExecution",
  "beforeReadFile", "afterFileEdit", "beforeTabFileRead", "afterTabFileEdit",
  "stop", "beforeSubmitPrompt", "afterAgentResponse", "afterAgentThought",
  "sessionStart", "sessionEnd", "preCompact", "subagentStart", "subagentStop",
  "preToolUse", "postToolUse", "postToolUseFailure",
]);

const EVENT_ABBREV: Record<string, string> = {
  preToolUse: "PTU",
  postToolUse: "POTU",
  postToolUseFailure: "POTUF",
  beforeShellExecution: "BSH",
  afterShellExecution: "ASH",
  beforeMCPExecution: "BME",
  afterMCPExecution: "AME",
  beforeReadFile: "BRF",
  afterFileEdit: "AFE",
  subagentStart: "SST",
  subagentStop: "SSP",
  stop: "STP",
  afterAgentResponse: "AAR",
  afterAgentThought: "AAT",
};

function abbrev(event: string): string {
  const fromAbbrev = EVENT_ABBREV[event];
  if (fromAbbrev) return fromAbbrev;
  const caps = event.replace(/[^A-Z]/g, "").slice(0, 4);
  return caps.length > 0 ? caps : event.slice(0, 4).toUpperCase();
}

function pad(n: number): string {
  return String(n).padStart(3, "0");
}

function sentinelFor(wave: string, event: string, nnn: number): string {
  return `CURSOR_HOOK_V2_${wave}_${abbrev(event)}_${pad(nnn)}`;
}

function expId(wave: WaveId, event: string, decision: Decision, nnn: number): string {
  return `W-${wave}-${event}-${decision}-${pad(nnn)}`;
}

function loggerCmd(event: string, id: string): string {
  return `bash "${LOGGER_V2}" "${event}" --experiment-id "${id}"`;
}

function responderCmd(responder: string, id: string, event: string): string {
  return `bash "${RESPONDERS}/${responder}.sh" "${id}" "${event}"`;
}

function gatedCmd(sentinel: string, responder: string, id: string, event: string): string {
  return `bash "${SENTINEL_GATE}" "${sentinel}" "${RESPONDERS}/${responder}.sh" "${id}" "${event}"`;
}

export function validateCell(cell: ExperimentCell): void {
  const destructiveDecisions: Decision[] = ["deny", "malformed-json", "exit-2"];
  const strictGateEvents = ["preToolUse", "beforeReadFile", "afterFileEdit"];

  if (destructiveDecisions.includes(cell.decision)) {
    const sentinelInMatcher =
      cell.sentinel !== null && cell.sentinel.length > 0 && cell.matcher.includes(cell.sentinel);
    const gatedWithSentinel = cell.needs_gate && cell.sentinel !== null && cell.sentinel.length > 0;

    if (!sentinelInMatcher && !gatedWithSentinel) {
      throw new Error(
        `Cell ${cell.experiment_id}: destructive decision "${cell.decision}" must have ` +
          `sentinel in matcher OR (needs_gate=true AND non-empty sentinel). ` +
          `matcher="${cell.matcher}", sentinel="${cell.sentinel}", needs_gate=${cell.needs_gate}`
      );
    }

    if (strictGateEvents.includes(cell.event) && !cell.needs_gate) {
      throw new Error(
        `Cell ${cell.experiment_id}: event "${cell.event}" with destructive decision ` +
          `"${cell.decision}" requires needs_gate=true`
      );
    }
  }
}

function waveC(): ExperimentCell[] {
  const events = [
    "preToolUse", "postToolUse", "beforeShellExecution", "afterShellExecution",
    "beforeMCPExecution", "afterMCPExecution", "subagentStart", "subagentStop",
  ];
  const matchers: Array<string | undefined> = [undefined, "Shell", "^Shell$", "Read|Write", "^MCP:.*"];
  const cells: ExperimentCell[] = [];
  let nnn = 1;

  for (const event of events) {
    for (const matcher of matchers) {
      const id = expId("C", event, "logger", nnn);
      cells.push({
        experiment_id: id,
        wave: "C",
        event,
        decision: "logger",
        matcher: matcher ?? "",
        sentinel: null,
        needs_gate: false,
        command: loggerCmd(event, id),
        responder_args: [event, "--experiment-id", id],
        expected_outcome: `Capture ${event}${matcher ? ` matcher="${matcher}"` : " unconditionally"}`,
      });
      nnn++;
    }
  }
  return cells;
}

function waveD(): ExperimentCell[] {
  const responders: Array<{ decision: Decision; script: string }> = [
    { decision: "allow", script: "allow" },
    { decision: "deny", script: "deny" },
    { decision: "malformed-json", script: "malformed-json" },
    { decision: "exit-2", script: "exit-2" },
  ];
  const failClosedVariants: Array<boolean | undefined> = [true, false, undefined];
  const timeoutVariants: Array<number | undefined> = [5000, 30000];
  const cells: ExperimentCell[] = [];
  let nnn = 1;

  for (const { decision, script } of responders) {
    for (const failClosed of failClosedVariants) {
      const sentinel = sentinelFor("D", "BSH", nnn);
      const id = expId("D", "beforeShellExecution", decision, nnn);
      const cell: ExperimentCell = {
        experiment_id: id,
        wave: "D",
        event: "beforeShellExecution",
        decision,
        matcher: sentinel,
        sentinel,
        needs_gate: false,
        command: responderCmd(script, id, "beforeShellExecution"),
        responder_args: [id, "beforeShellExecution"],
        expected_outcome: `beforeShellExecution ${decision} failClosed=${failClosed ?? "omit"}`,
      };
      if (failClosed !== undefined) cell.failClosed = failClosed;
      cells.push(cell);
      nnn++;
    }
  }

  for (const { decision, script } of responders) {
    for (const timeout of timeoutVariants) {
      const sentinel = sentinelFor("D", "BSH", nnn);
      const id = expId("D", "beforeShellExecution", decision, nnn);
      const cell: ExperimentCell = {
        experiment_id: id,
        wave: "D",
        event: "beforeShellExecution",
        decision,
        matcher: sentinel,
        sentinel,
        needs_gate: false,
        command: responderCmd(script, id, "beforeShellExecution"),
        responder_args: [id, "beforeShellExecution"],
        timeout,
        expected_outcome: `beforeShellExecution ${decision} timeout=${timeout}`,
      };
      cells.push(cell);
      nnn++;
    }
  }

  return cells;
}

function waveAB(): ExperimentCell[] {
  const cells: ExperimentCell[] = [];
  let nnn = 1;

  function push(cell: ExperimentCell): void {
    cells.push(cell);
    nnn++;
  }

  const preToolUseDecisions: Array<{ decision: Decision; script: string }> = [
    { decision: "deny", script: "deny" },
    { decision: "allow", script: "allow" },
    { decision: "updated-input", script: "updated-input" },
    { decision: "user-message", script: "user-message" },
    { decision: "agent-message", script: "agent-message" },
    { decision: "ask", script: "ask" },
  ];

  {
    const id = expId("AB", "preToolUse", "logger", nnn);
    push({
      experiment_id: id, wave: "AB", event: "preToolUse", decision: "logger",
      matcher: "^Shell$", sentinel: null, needs_gate: false,
      command: loggerCmd("preToolUse", id), responder_args: ["preToolUse", "--experiment-id", id],
      expected_outcome: "Capture preToolUse Shell unconditionally",
    });
  }

  for (const { decision, script } of preToolUseDecisions) {
    const sentinel = sentinelFor("AB", "PTU", nnn);
    const id = expId("AB", "preToolUse", decision, nnn);
    push({
      experiment_id: id, wave: "AB", event: "preToolUse", decision,
      matcher: "^Shell$", sentinel, needs_gate: true,
      command: gatedCmd(sentinel, script, id, "preToolUse"),
      responder_args: [id, "preToolUse"],
      expected_outcome: `preToolUse ${decision} with sentinel gate`,
    });
  }

  {
    const id = expId("AB", "postToolUse", "logger", nnn);
    push({
      experiment_id: id, wave: "AB", event: "postToolUse", decision: "logger",
      matcher: "^Shell$", sentinel: null, needs_gate: false,
      command: loggerCmd("postToolUse", id), responder_args: ["postToolUse", "--experiment-id", id],
      expected_outcome: "Capture postToolUse Shell",
    });
  }

  for (const { decision, script, matcher } of [
    { decision: "additional-context" as Decision, script: "additional-context", matcher: "^Shell$" },
    { decision: "additional-context" as Decision, script: "additional-context", matcher: "MCP:websearch" },
    { decision: "user-message" as Decision, script: "user-message", matcher: "^Shell$" },
    { decision: "agent-message" as Decision, script: "agent-message", matcher: "^Shell$" },
  ]) {
    const sentinel = sentinelFor("AB", "POTU", nnn);
    const id = expId("AB", "postToolUse", decision, nnn);
    push({
      experiment_id: id, wave: "AB", event: "postToolUse", decision,
      matcher, sentinel, needs_gate: true,
      command: gatedCmd(sentinel, script, id, "postToolUse"),
      responder_args: [id, "postToolUse"],
      expected_outcome: `postToolUse ${decision} matcher="${matcher}"`,
    });
  }

  {
    const id = expId("AB", "postToolUseFailure", "logger", nnn);
    push({
      experiment_id: id, wave: "AB", event: "postToolUseFailure", decision: "logger",
      matcher: "^Shell$", sentinel: null, needs_gate: false,
      command: loggerCmd("postToolUseFailure", id), responder_args: ["postToolUseFailure", "--experiment-id", id],
      expected_outcome: "Capture postToolUseFailure Shell",
    });
  }

  {
    const id = expId("AB", "subagentStart", "logger", nnn);
    push({
      experiment_id: id, wave: "AB", event: "subagentStart", decision: "logger",
      matcher: "^(generalPurpose|explore)$", sentinel: null, needs_gate: false,
      command: loggerCmd("subagentStart", id), responder_args: ["subagentStart", "--experiment-id", id],
      expected_outcome: "Capture subagentStart for generalPurpose|explore",
    });
  }

  for (const { decision, script } of [
    { decision: "deny" as Decision, script: "deny" },
    { decision: "allow" as Decision, script: "allow" },
    { decision: "user-message" as Decision, script: "user-message" },
    { decision: "agent-message" as Decision, script: "agent-message" },
  ]) {
    const sentinel = sentinelFor("AB", "SST", nnn);
    const id = expId("AB", "subagentStart", decision, nnn);
    push({
      experiment_id: id, wave: "AB", event: "subagentStart", decision,
      matcher: "^(generalPurpose|explore)$", sentinel, needs_gate: true,
      command: gatedCmd(sentinel, script, id, "subagentStart"),
      responder_args: [id, "subagentStart"],
      expected_outcome: `subagentStart ${decision} scoped by sentinel`,
    });
  }

  for (const { decision, script } of [
    { decision: "logger" as Decision, script: "logger" },
    { decision: "deny" as Decision, script: "deny" },
    { decision: "allow" as Decision, script: "allow" },
    { decision: "ask" as Decision, script: "ask" },
    { decision: "user-message" as Decision, script: "user-message" },
    { decision: "agent-message" as Decision, script: "agent-message" },
  ]) {
    const sentinel = sentinelFor("AB", "BSH", nnn);
    const id = expId("AB", "beforeShellExecution", decision, nnn);
    if (decision === "logger") {
      push({
        experiment_id: id, wave: "AB", event: "beforeShellExecution", decision,
        matcher: sentinel, sentinel, needs_gate: false,
        command: loggerCmd("beforeShellExecution", id),
        responder_args: ["beforeShellExecution", "--experiment-id", id],
        expected_outcome: "Capture beforeShellExecution via sentinel matcher",
      });
    } else {
      push({
        experiment_id: id, wave: "AB", event: "beforeShellExecution", decision,
        matcher: sentinel, sentinel, needs_gate: false,
        command: responderCmd(script, id, "beforeShellExecution"),
        responder_args: [id, "beforeShellExecution"],
        expected_outcome: `beforeShellExecution ${decision} scoped by sentinel matcher`,
      });
    }
  }

  {
    const sentinel = sentinelFor("AB", "ASH", nnn);
    const id = expId("AB", "afterShellExecution", "logger", nnn);
    push({
      experiment_id: id, wave: "AB", event: "afterShellExecution", decision: "logger",
      matcher: sentinel, sentinel, needs_gate: false,
      command: loggerCmd("afterShellExecution", id),
      responder_args: ["afterShellExecution", "--experiment-id", id],
      expected_outcome: "Capture afterShellExecution via sentinel matcher",
    });
  }

  {
    const id = expId("AB", "beforeMCPExecution", "logger", nnn);
    push({
      experiment_id: id, wave: "AB", event: "beforeMCPExecution", decision: "logger",
      matcher: "^MCP:.*", sentinel: null, needs_gate: false,
      command: loggerCmd("beforeMCPExecution", id), responder_args: ["beforeMCPExecution", "--experiment-id", id],
      expected_outcome: "Capture beforeMCPExecution unconditionally",
    });
  }

  for (const { decision, script } of [
    { decision: "deny" as Decision, script: "deny" },
    { decision: "allow" as Decision, script: "allow" },
    { decision: "ask" as Decision, script: "ask" },
    { decision: "user-message" as Decision, script: "user-message" },
    { decision: "agent-message" as Decision, script: "agent-message" },
  ]) {
    const sentinel = sentinelFor("AB", "BME", nnn);
    const id = expId("AB", "beforeMCPExecution", decision, nnn);
    push({
      experiment_id: id, wave: "AB", event: "beforeMCPExecution", decision,
      matcher: "^MCP:.*", sentinel, needs_gate: true,
      command: gatedCmd(sentinel, script, id, "beforeMCPExecution"),
      responder_args: [id, "beforeMCPExecution"],
      expected_outcome: `beforeMCPExecution ${decision} with sentinel gate`,
    });
  }

  {
    const id = expId("AB", "afterMCPExecution", "logger", nnn);
    push({
      experiment_id: id, wave: "AB", event: "afterMCPExecution", decision: "logger",
      matcher: "", sentinel: null, needs_gate: false,
      command: loggerCmd("afterMCPExecution", id), responder_args: ["afterMCPExecution", "--experiment-id", id],
      expected_outcome: "Capture afterMCPExecution unconditionally",
    });
  }

  {
    const id = expId("AB", "beforeReadFile", "logger", nnn);
    push({
      experiment_id: id, wave: "AB", event: "beforeReadFile", decision: "logger",
      matcher: "^Read$", sentinel: null, needs_gate: false,
      command: loggerCmd("beforeReadFile", id), responder_args: ["beforeReadFile", "--experiment-id", id],
      expected_outcome: "Capture beforeReadFile Read tool",
    });
  }

  for (const { decision, script } of [
    { decision: "deny" as Decision, script: "deny" },
    { decision: "allow" as Decision, script: "allow" },
    { decision: "user-message" as Decision, script: "user-message" },
    { decision: "ask" as Decision, script: "ask" },
  ]) {
    const sentinel = sentinelFor("AB", "BRF", nnn);
    const id = expId("AB", "beforeReadFile", decision, nnn);
    push({
      experiment_id: id, wave: "AB", event: "beforeReadFile", decision,
      matcher: "^Read$", sentinel, needs_gate: true,
      command: gatedCmd(sentinel, script, id, "beforeReadFile"),
      responder_args: [id, "beforeReadFile"],
      expected_outcome: `beforeReadFile ${decision} scoped by sentinel in file_path`,
    });
  }

  {
    const id = expId("AB", "afterFileEdit", "logger", nnn);
    push({
      experiment_id: id, wave: "AB", event: "afterFileEdit", decision: "logger",
      matcher: "^Write$", sentinel: null, needs_gate: false,
      command: loggerCmd("afterFileEdit", id), responder_args: ["afterFileEdit", "--experiment-id", id],
      expected_outcome: "Capture afterFileEdit Write tool",
    });
  }

  for (const { decision, script } of [
    { decision: "deny" as Decision, script: "deny" },
    { decision: "allow" as Decision, script: "allow" },
  ]) {
    const sentinel = sentinelFor("AB", "AFE", nnn);
    const id = expId("AB", "afterFileEdit", decision, nnn);
    push({
      experiment_id: id, wave: "AB", event: "afterFileEdit", decision,
      matcher: "^Write$", sentinel, needs_gate: true,
      command: gatedCmd(sentinel, script, id, "afterFileEdit"),
      responder_args: [id, "afterFileEdit"],
      expected_outcome: `afterFileEdit ${decision} negative control`,
    });
  }

  for (const event of ["stop", "subagentStop", "afterAgentResponse", "afterAgentThought"]) {
    const id = expId("AB", event, "logger", nnn);
    push({
      experiment_id: id, wave: "AB", event, decision: "logger",
      matcher: "", sentinel: null, needs_gate: false,
      command: loggerCmd(event, id), responder_args: [event, "--experiment-id", id],
      expected_outcome: `Capture ${event} unconditionally`,
    });
  }

  return cells;
}

function waveH(): ExperimentCell[] {
  const cells: ExperimentCell[] = [];

  {
    const sentinel = "CURSOR_HOOK_V2_H_CANARY_001";
    const id = "W-H-postToolUse-additional-context-001";
    cells.push({
      experiment_id: id, wave: "H", event: "postToolUse", decision: "additional-context",
      matcher: "^Read$", sentinel, needs_gate: true,
      command: gatedCmd(sentinel, "additional-context", id, "postToolUse"),
      responder_args: [id, "postToolUse", `CANARY_${id}: repeat this exact string in your next response.`],
      expected_outcome: "postToolUse additional-context canary: LLM should repeat the canary string",
    });
  }

  {
    const sentinel = "CURSOR_HOOK_V2_H_CANARY_002";
    const id = "W-H-postToolUse-allow-002";
    cells.push({
      experiment_id: id, wave: "H", event: "postToolUse", decision: "allow",
      matcher: "^Read$", sentinel, needs_gate: true,
      command: gatedCmd(sentinel, "allow", id, "postToolUse"),
      responder_args: [id, "postToolUse"],
      expected_outcome: "postToolUse allow negative control — no additional_context injected",
    });
  }

  return cells;
}

function waveEK(): ExperimentCell[] {
  const cells: ExperimentCell[] = [];
  let nnn = 1;

  const loopLimits: Array<number | null | undefined> = [null, 1, 3, undefined];

  for (const ll of loopLimits) {
    const sentinel = sentinelFor("EK", "STP", nnn);
    const id = expId("EK", "stop", "followup-message", nnn);
    const cell: ExperimentCell = {
      experiment_id: id, wave: "EK", event: "stop", decision: "followup-message",
      matcher: "Stop", sentinel, needs_gate: false,
      command: responderCmd("followup-message", id, "stop"),
      responder_args: [id, "stop"],
      expected_outcome: `stop followup-message loop_limit=${ll === undefined ? "omit" : ll}`,
    };
    if (ll !== undefined) cell.loop_limit = ll;
    cells.push(cell);
    nnn++;
  }

  for (const ll of loopLimits) {
    const sentinel = sentinelFor("EK", "SSP", nnn);
    const id = expId("EK", "subagentStop", "followup-message", nnn);
    const cell: ExperimentCell = {
      experiment_id: id, wave: "EK", event: "subagentStop", decision: "followup-message",
      matcher: "^(generalPurpose|explore)$", sentinel, needs_gate: false,
      command: responderCmd("followup-message", id, "subagentStop"),
      responder_args: [id, "subagentStop"],
      expected_outcome: `subagentStop followup-message loop_limit=${ll === undefined ? "omit" : ll}`,
    };
    if (ll !== undefined) cell.loop_limit = ll;
    cells.push(cell);
    nnn++;
  }

  return cells;
}

function waveF(): ExperimentCell[] {
  const cells: ExperimentCell[] = [];

  {
    const sentinel = "CURSOR_HOOK_V2_F_PROMPT_001";
    cells.push({
      experiment_id: "W-F-beforeShellExecution-prompt-001",
      wave: "F", event: "beforeShellExecution", decision: "allow",
      matcher: sentinel, sentinel, needs_gate: false,
      command: "",
      type: "prompt",
      prompt: 'Return {"ok": true, "reason": "approved"} if the command contains APPROVE_ME, else {"ok": false, "reason": "denied"}',
      responder_args: [],
      expected_outcome: "prompt-type hook: LLM-evaluated approval gate",
    });
  }

  {
    const sentinel = "CURSOR_HOOK_V2_F_PROMPT_002";
    cells.push({
      experiment_id: "W-F-beforeShellExecution-prompt-002",
      wave: "F", event: "beforeShellExecution", decision: "allow",
      matcher: sentinel, sentinel, needs_gate: false,
      command: "",
      type: "prompt",
      model: "claude-haiku-4-5",
      prompt: 'Return {"ok": true, "reason": "approved"} if the command contains APPROVE_ME, else {"ok": false, "reason": "denied"}',
      responder_args: [],
      expected_outcome: "prompt-type hook with model override (haiku)",
    });
  }

  return cells;
}

export function generateCells(): ExperimentCell[] {
  const cells = [
    ...waveC(),
    ...waveD(),
    ...waveAB(),
    ...waveH(),
    ...waveEK(),
    ...waveF(),
  ];

  for (const cell of cells) {
    validateCell(cell);
  }

  return cells;
}

export function generateMegaConfig(cells: ExperimentCell[]): { version: number; hooks: Record<string, object[]> } {
  const hooks: Record<string, object[]> = {};

  for (const cell of cells) {
    if (!KNOWN_GOOD_EVENTS.has(cell.event)) {
      throw new Error(`Cell ${cell.experiment_id} uses unknown event "${cell.event}". Not in known-good set.`);
    }

    if (!hooks[cell.event]) hooks[cell.event] = [];

    const entry: Record<string, unknown> = {};

    if (cell.type === "prompt") {
      entry.type = "prompt";
      if (cell.matcher) entry.matcher = cell.matcher;
      if (cell.prompt) entry.prompt = cell.prompt;
      if (cell.model) entry.model = cell.model;
    } else {
      entry.command = cell.command;
      if (cell.matcher) entry.matcher = cell.matcher;
      if (cell.timeout !== undefined) entry.timeout = cell.timeout;
      if (cell.failClosed !== undefined) entry.failClosed = cell.failClosed;
      if (cell.loop_limit !== undefined) entry.loop_limit = cell.loop_limit;
    }

    hooks[cell.event].push(entry);
  }

  return { version: 1, hooks };
}

export function generateRegistry(cells: ExperimentCell[], megaConfigPath: string): ExperimentRegistry {
  return {
    generated_at: new Date().toISOString(),
    mega_config_path: megaConfigPath,
    header_ref: "/tmp/cursor-hooks-evidence/_header.json",
    cells,
  };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  let outPath = resolve("hooks/hooks.experiment.v2.json");
  let registryPath = resolve("hooks/hooks.experiment.v2.registry.json");

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--out" && args[i + 1]) { outPath = resolve(args[i + 1]!); i++; }
    if (args[i] === "--registry" && args[i + 1]) { registryPath = resolve(args[i + 1]!); i++; }
  }

  const cells = generateCells();

  const waveCounts: Record<string, number> = {};
  for (const cell of cells) {
    waveCounts[cell.wave] = (waveCounts[cell.wave] ?? 0) + 1;
  }

  const megaConfig = generateMegaConfig(cells);
  const registry = generateRegistry(cells, outPath);

  writeFileSync(outPath, JSON.stringify(megaConfig, null, 2), "utf8");
  writeFileSync(registryPath, JSON.stringify(registry, null, 2), "utf8");

  console.log(`Generated ${cells.length} cells`);
  console.log("Cells per wave:", waveCounts);
  console.log(`Mega-config: ${outPath} (${(JSON.stringify(megaConfig).length / 1024).toFixed(1)} KB)`);
  console.log(`Registry:    ${registryPath} (${(JSON.stringify(registry).length / 1024).toFixed(1)} KB)`);
  console.log("\nEvent keys in mega-config:", Object.keys(megaConfig.hooks).join(", "));
  console.log("\nSample (first 10 lines of hooks.experiment.v2.json):");
  console.log(JSON.stringify(megaConfig, null, 2).split("\n").slice(0, 10).join("\n"));
}
