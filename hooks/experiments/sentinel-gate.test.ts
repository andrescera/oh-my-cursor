import { test, expect, beforeAll } from "bun:test";
import { writeFileSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { join } from "node:path";

const GATE = resolve(import.meta.dir, "sentinel-gate.sh");

const ECHO_DELEGATE = join(tmpdir(), "sg-test-echo-delegate.sh");
const FAIL_DELEGATE = join(tmpdir(), "sg-test-fail-delegate.sh");

beforeAll(() => {
  writeFileSync(
    ECHO_DELEGATE,
    "#!/usr/bin/env bash\ncat\nprintf '\\nDELEGATE_INVOKED\\n'\n",
    "utf8"
  );
  chmodSync(ECHO_DELEGATE, 0o755);

  writeFileSync(
    FAIL_DELEGATE,
    "#!/usr/bin/env bash\ncat\nprintf '\\nFAIL_DELEGATE\\n'\nexit 42\n",
    "utf8"
  );
  chmodSync(FAIL_DELEGATE, 0o755);
});

test("stdin contains sentinel → delegate invoked, stdout is delegate output", () => {
  const stdin = Buffer.from("hello MY_SENTINEL world");
  const result = Bun.spawnSync(["bash", GATE, "MY_SENTINEL", ECHO_DELEGATE], {
    stdin,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = result.stdout.toString("utf8");
  expect(result.exitCode).toBe(0);
  expect(stdout).toContain("DELEGATE_INVOKED");
  expect(stdout).toContain("MY_SENTINEL");
});

test("stdin missing sentinel → stdout is {}, exit 0, delegate NOT invoked", () => {
  const stdin = Buffer.from("hello world no trigger here");
  const result = Bun.spawnSync(["bash", GATE, "MY_SENTINEL", ECHO_DELEGATE], {
    stdin,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = result.stdout.toString("utf8").trim();
  expect(result.exitCode).toBe(0);
  expect(stdout).toBe("{}");
  expect(stdout).not.toContain("DELEGATE_INVOKED");
});

test("delegate non-zero exit code is propagated", () => {
  const stdin = Buffer.from("trigger MY_SENTINEL here");
  const result = Bun.spawnSync(["bash", GATE, "MY_SENTINEL", FAIL_DELEGATE], {
    stdin,
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(result.exitCode).toBe(42);
});
