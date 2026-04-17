import { test, expect, describe, afterEach } from "bun:test";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  chmodSync,
  readFileSync,
  existsSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";

const RESPONDERS_DIR = join(import.meta.dir);

function makeEnv(tmp: string): { pidFile: string; env: Record<string, string> } {
  const pidFile = join(tmp, "inflight.pid");
  const stubLogger = join(tmp, "stub-logger.sh");
  writeFileSync(stubLogger, "#!/usr/bin/env bash\ncat >/dev/null\n");
  chmodSync(stubLogger, 0o755);
  return {
    pidFile,
    env: {
      ...process.env,
      CURSOR_HOOKS_INFLIGHT_PID_FILE: pidFile,
      CURSOR_HOOKS_LOGGER: stubLogger,
    },
  };
}

async function runResponder(
  responder: string,
  args: string[],
  env: Record<string, string>,
  stdinData = '{"hook":"test"}'
): Promise<{ stdout: string; stderr: string; code: number }> {
  const proc = Bun.spawn(
    ["bash", join(RESPONDERS_DIR, responder), ...args],
    {
      env,
      stdin: new Blob([stdinData]),
      stdout: "pipe",
      stderr: "pipe",
    }
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, code };
}

function assertPidCleared(pidFile: string) {
  expect(existsSync(pidFile)).toBe(true);
  expect(readFileSync(pidFile, "utf8").trim()).toBe("");
}

const tmps: string[] = [];
function makeTmp(): string {
  const tmp = mkdtempSync(join(tmpdir(), "resp-test-"));
  tmps.push(tmp);
  return tmp;
}

afterEach(() => {
  while (tmps.length > 0) {
    const tmp = tmps.pop()!;
    try { rmSync(tmp, { recursive: true }); } catch {}
  }
});

describe("deny responder", () => {
  test("emits deny JSON with custom messages and removes PID", async () => {
    const tmp = makeTmp();
    const { pidFile, env } = makeEnv(tmp);
    const { stdout, code } = await runResponder(
      "deny.sh",
      ["EXP-1", "preToolUse", "user-msg", "agent-msg"],
      env
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.permission).toBe("deny");
    expect(parsed.user_message).toBe("user-msg");
    expect(parsed.agent_message).toBe("agent-msg");
    assertPidCleared(pidFile);
  });

  test("uses defaults when messages omitted", async () => {
    const tmp = makeTmp();
    const { env } = makeEnv(tmp);
    const { stdout, code } = await runResponder("deny.sh", ["EXP-1", "preToolUse"], env);
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.permission).toBe("deny");
    expect(parsed.user_message).toBe("denied by experiment");
    expect(parsed.agent_message).toBe("blocked by hook-v2 experiment");
  });
});

describe("allow responder", () => {
  test("emits allow JSON and removes PID", async () => {
    const tmp = makeTmp();
    const { pidFile, env } = makeEnv(tmp);
    const { stdout, code } = await runResponder("allow.sh", ["EXP-2", "preToolUse"], env);
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.permission).toBe("allow");
    assertPidCleared(pidFile);
  });
});

describe("ask responder", () => {
  test("emits ask JSON with custom message and removes PID", async () => {
    const tmp = makeTmp();
    const { pidFile, env } = makeEnv(tmp);
    const { stdout, code } = await runResponder(
      "ask.sh",
      ["EXP-3", "preToolUse", "please confirm"],
      env
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.permission).toBe("ask");
    expect(parsed.user_message).toBe("please confirm");
    assertPidCleared(pidFile);
  });

  test("uses default user_message when omitted", async () => {
    const tmp = makeTmp();
    const { env } = makeEnv(tmp);
    const { stdout, code } = await runResponder("ask.sh", ["EXP-3", "preToolUse"], env);
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.user_message).toBe("ask-permission experiment");
  });
});

describe("updated-input responder", () => {
  test("emits allow with updated_input JSON and removes PID", async () => {
    const tmp = makeTmp();
    const { pidFile, env } = makeEnv(tmp);
    const inputJson = JSON.stringify({ command: "ls -la" });
    const { stdout, code } = await runResponder(
      "updated-input.sh",
      ["EXP-4", "preToolUse", inputJson],
      env
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.permission).toBe("allow");
    expect(parsed.updated_input).toEqual({ command: "ls -la" });
    assertPidCleared(pidFile);
  });
});

describe("additional-context responder", () => {
  test("emits additional_context string and removes PID", async () => {
    const tmp = makeTmp();
    const { pidFile, env } = makeEnv(tmp);
    const { stdout, code } = await runResponder(
      "additional-context.sh",
      ["EXP-5", "postToolUse", "extra info here"],
      env
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.additional_context).toBe("extra info here");
    assertPidCleared(pidFile);
  });

  test("uses CANARY_DEFAULT when omitted", async () => {
    const tmp = makeTmp();
    const { env } = makeEnv(tmp);
    const { stdout, code } = await runResponder(
      "additional-context.sh",
      ["EXP-5", "postToolUse"],
      env
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.additional_context).toBe("CANARY_DEFAULT");
  });
});

describe("followup-message responder", () => {
  test("emits followup_message and removes PID", async () => {
    const tmp = makeTmp();
    const { pidFile, env } = makeEnv(tmp);
    const { stdout, code } = await runResponder(
      "followup-message.sh",
      ["EXP-6", "stop", "continue the task"],
      env
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.followup_message).toBe("continue the task");
    assertPidCleared(pidFile);
  });

  test("uses default when omitted", async () => {
    const tmp = makeTmp();
    const { env } = makeEnv(tmp);
    const { stdout, code } = await runResponder(
      "followup-message.sh",
      ["EXP-6", "stop"],
      env
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.followup_message).toBe("CURSOR_HOOK_FOLLOWUP_DEFAULT");
  });
});

describe("env-inject responder", () => {
  test("emits env JSON object and removes PID", async () => {
    const tmp = makeTmp();
    const { pidFile, env } = makeEnv(tmp);
    const envJson = JSON.stringify({ MY_VAR: "hello", DEBUG: "1" });
    const { stdout, code } = await runResponder(
      "env-inject.sh",
      ["EXP-7", "sessionStart", envJson],
      env
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.env).toEqual({ MY_VAR: "hello", DEBUG: "1" });
    assertPidCleared(pidFile);
  });
});

describe("malformed-json responder", () => {
  test("stdout is NOT valid JSON and removes PID", async () => {
    const tmp = makeTmp();
    const { pidFile, env } = makeEnv(tmp);
    const { stdout, code } = await runResponder("malformed-json.sh", ["EXP-8", "preToolUse"], env);
    expect(code).toBe(0);
    expect(() => JSON.parse(stdout)).toThrow();
    assertPidCleared(pidFile);
  });

  test("stdout contains the malformed payload string", async () => {
    const tmp = makeTmp();
    const { env } = makeEnv(tmp);
    const { stdout } = await runResponder("malformed-json.sh", ["EXP-8", "preToolUse"], env);
    expect(stdout).toContain("{permission:");
  });
});

describe("exit-2 responder", () => {
  test("exits with code 2, no stdout, and removes PID", async () => {
    const tmp = makeTmp();
    const { pidFile, env } = makeEnv(tmp);
    const { stdout, code } = await runResponder("exit-2.sh", ["EXP-9", "preToolUse"], env);
    expect(code).toBe(2);
    expect(stdout.trim()).toBe("");
    assertPidCleared(pidFile);
  });
});

describe("user-message responder", () => {
  test("emits user_message and removes PID", async () => {
    const tmp = makeTmp();
    const { pidFile, env } = makeEnv(tmp);
    const { stdout, code } = await runResponder(
      "user-message.sh",
      ["EXP-10", "postToolUse", "visible to user"],
      env
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.user_message).toBe("visible to user");
    assertPidCleared(pidFile);
  });

  test("uses default when omitted", async () => {
    const tmp = makeTmp();
    const { env } = makeEnv(tmp);
    const { stdout, code } = await runResponder(
      "user-message.sh",
      ["EXP-10", "postToolUse"],
      env
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.user_message).toBe("user-visible note");
  });
});

describe("agent-message responder", () => {
  test("emits agent_message and removes PID", async () => {
    const tmp = makeTmp();
    const { pidFile, env } = makeEnv(tmp);
    const { stdout, code } = await runResponder(
      "agent-message.sh",
      ["EXP-11", "postToolUse", "visible to agent"],
      env
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.agent_message).toBe("visible to agent");
    assertPidCleared(pidFile);
  });

  test("uses default when omitted", async () => {
    const tmp = makeTmp();
    const { env } = makeEnv(tmp);
    const { stdout, code } = await runResponder(
      "agent-message.sh",
      ["EXP-11", "postToolUse"],
      env
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.agent_message).toBe("agent-visible note");
  });
});
