import { test, expect, describe } from "bun:test";
import { generateCells, generateMegaConfig, generateRegistry, validateCell } from "./matrix";
import { generateGhostConfig } from "./ghost-config";
import type { ExperimentCell, Decision } from "./matrix-types";

const KNOWN_GOOD_EVENTS = new Set([
  "beforeShellExecution", "beforeMCPExecution", "afterShellExecution", "afterMCPExecution",
  "beforeReadFile", "afterFileEdit", "beforeTabFileRead", "afterTabFileEdit",
  "stop", "beforeSubmitPrompt", "afterAgentResponse", "afterAgentThought",
  "sessionStart", "sessionEnd", "preCompact", "subagentStart", "subagentStop",
  "preToolUse", "postToolUse", "postToolUseFailure",
]);

describe("generateMegaConfig", () => {
  test("returns valid hooks.json shape with version 1 and known-good event keys only", () => {
    const cells = generateCells();
    const config = generateMegaConfig(cells);

    expect(config.version).toBe(1);
    expect(typeof config.hooks).toBe("object");
    expect(config.hooks).not.toBeNull();

    for (const eventKey of Object.keys(config.hooks)) {
      expect(KNOWN_GOOD_EVENTS.has(eventKey)).toBe(true);
    }

    const knownKeys = ["preToolUse", "beforeShellExecution", "postToolUse", "subagentStart", "stop"];
    for (const key of knownKeys) {
      expect(config.hooks[key]).toBeDefined();
      expect(Array.isArray(config.hooks[key])).toBe(true);
    }
  });

  test("every cell has a unique experiment_id", () => {
    const cells = generateCells();
    const ids = cells.map((c) => c.experiment_id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  test("registry cell count matches hooks.json total entry count", () => {
    const cells = generateCells();
    const config = generateMegaConfig(cells);
    const registry = generateRegistry(cells, "hooks/hooks.experiment.v2.json");

    const hookEntryCount = Object.values(config.hooks).reduce((sum, arr) => sum + arr.length, 0);
    expect(registry.cells.length).toBe(hookEntryCount);
    expect(registry.cells.length).toBe(cells.length);
  });

  test("total cell count is at least 100", () => {
    const cells = generateCells();
    expect(cells.length).toBeGreaterThanOrEqual(100);
  });

  test("cells-per-wave breakdown covers all waves", () => {
    const cells = generateCells();
    const waveCounts: Record<string, number> = {};
    for (const cell of cells) {
      waveCounts[cell.wave] = (waveCounts[cell.wave] ?? 0) + 1;
    }
    expect(waveCounts["C"]).toBe(40);
    expect(waveCounts["D"]).toBe(20);
    expect((waveCounts["AB"] ?? 0)).toBeGreaterThanOrEqual(40);
    expect(waveCounts["H"]).toBe(2);
    expect(waveCounts["EK"]).toBe(8);
    expect(waveCounts["F"]).toBe(2);
  });
});

describe("validateCell", () => {
  test("rejects destructive decision without sentinel in matcher or gate", () => {
    const bad: ExperimentCell = {
      experiment_id: "W-TEST-preToolUse-deny-999",
      wave: "AB", event: "preToolUse", decision: "deny",
      matcher: "^Shell$",
      sentinel: null,
      needs_gate: false,
      command: "bash deny.sh",
      responder_args: [],
      expected_outcome: "should fail validation",
    };
    expect(() => validateCell(bad)).toThrow();
  });

  test("accepts destructive cell when sentinel is in matcher", () => {
    const good: ExperimentCell = {
      experiment_id: "W-D-beforeShellExecution-deny-001",
      wave: "D", event: "beforeShellExecution", decision: "deny",
      matcher: "CURSOR_HOOK_V2_D_BSH_001",
      sentinel: "CURSOR_HOOK_V2_D_BSH_001",
      needs_gate: false,
      command: "bash deny.sh",
      responder_args: [],
      expected_outcome: "ok",
    };
    expect(() => validateCell(good)).not.toThrow();
  });

  test("rejects preToolUse deny without needs_gate even if sentinel in matcher", () => {
    const bad: ExperimentCell = {
      experiment_id: "W-TEST-preToolUse-deny-999",
      wave: "AB", event: "preToolUse", decision: "deny",
      matcher: "CURSOR_HOOK_V2_AB_PTU_999",
      sentinel: "CURSOR_HOOK_V2_AB_PTU_999",
      needs_gate: false,
      command: "bash deny.sh",
      responder_args: [],
      expected_outcome: "should fail validation",
    };
    expect(() => validateCell(bad)).toThrow();
  });

  test("accepts preToolUse deny with needs_gate and sentinel", () => {
    const good: ExperimentCell = {
      experiment_id: "W-AB-preToolUse-deny-002",
      wave: "AB", event: "preToolUse", decision: "deny",
      matcher: "^Shell$",
      sentinel: "CURSOR_HOOK_V2_AB_PTU_002",
      needs_gate: true,
      command: "bash sentinel-gate.sh ...",
      responder_args: [],
      expected_outcome: "ok",
    };
    expect(() => validateCell(good)).not.toThrow();
  });

  test("accepts logger cell on preToolUse without gate", () => {
    const good: ExperimentCell = {
      experiment_id: "W-AB-preToolUse-logger-001",
      wave: "AB", event: "preToolUse", decision: "logger",
      matcher: "^Shell$",
      sentinel: null,
      needs_gate: false,
      command: "bash logger-v2.sh",
      responder_args: [],
      expected_outcome: "ok",
    };
    expect(() => validateCell(good)).not.toThrow();
  });
});

describe("ghost-config generator", () => {
  test("produces correct shape for snake_case candidate", () => {
    const config = generateGhostConfig("before_shell_execution");
    expect(config.version).toBe(1);
    expect(config.hooks["before_shell_execution"]).toBeDefined();
    expect(Array.isArray(config.hooks["before_shell_execution"])).toBe(true);
    expect(config.hooks["beforeShellExecution"]).toBeDefined();
  });

  test("produces correct shape for PascalCase candidate", () => {
    const config = generateGhostConfig("BeforeShellExecute");
    expect(config.version).toBe(1);
    expect(config.hooks["BeforeShellExecute"]).toBeDefined();
    expect(config.hooks["beforeShellExecution"]).toBeDefined();
  });

  test("refuses known-good event name", () => {
    expect(() => generateGhostConfig("preToolUse")).toThrow();
    expect(() => generateGhostConfig("beforeShellExecution")).toThrow();
    expect(() => generateGhostConfig("stop")).toThrow();
  });

  test("refuses invalid identifier", () => {
    expect(() => generateGhostConfig("1invalid")).toThrow();
    expect(() => generateGhostConfig("has space")).toThrow();
    expect(() => generateGhostConfig("has-dash")).toThrow();
  });
});
