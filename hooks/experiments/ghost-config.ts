import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const KNOWN_GOOD_EVENTS = new Set([
  "beforeShellExecution", "beforeMCPExecution", "afterShellExecution", "afterMCPExecution",
  "beforeReadFile", "afterFileEdit", "beforeTabFileRead", "afterTabFileEdit",
  "stop", "beforeSubmitPrompt", "afterAgentResponse", "afterAgentThought",
  "sessionStart", "sessionEnd", "preCompact", "subagentStart", "subagentStop",
  "preToolUse", "postToolUse", "postToolUseFailure",
]);

const CANDIDATE_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const REPO = "<REPO>";
const LOGGER_V2 = `${REPO}/hooks/scripts/experiment-logger-v2.sh`;

export function generateGhostConfig(candidate: string): { version: number; hooks: Record<string, object[]> } {
  if (!CANDIDATE_RE.test(candidate)) {
    throw new Error(
      `Invalid candidate "${candidate}": must match /^[a-zA-Z_][a-zA-Z0-9_]*$/`
    );
  }

  if (KNOWN_GOOD_EVENTS.has(candidate)) {
    throw new Error(
      `"${candidate}" is a known-good Cursor event — testing it as a ghost candidate would ` +
        `confuse real captures with ghost-detection. Use a non-standard name.`
    );
  }

  return {
    version: 1,
    hooks: {
      beforeShellExecution: [
        {
          command: `bash "${LOGGER_V2}" "beforeShellExecution" --experiment-id "GHOST_BASELINE_BSH"`,
        },
      ],
      [candidate]: [
        {
          command: `bash "${LOGGER_V2}" "${candidate}" --experiment-id "GHOST_CANDIDATE_${candidate.toUpperCase()}"`,
        },
      ],
    },
  };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  let candidate = "";
  let outPath = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--candidate" && args[i + 1]) { candidate = args[i + 1]!; i++; }
    if (args[i] === "--out" && args[i + 1]) { outPath = resolve(args[i + 1]!); i++; }
  }

  if (!candidate) {
    console.error("Usage: bun ghost-config.ts --candidate <event-name> --out <path>");
    process.exit(1);
  }

  const config = generateGhostConfig(candidate);

  if (outPath) {
    writeFileSync(outPath, JSON.stringify(config, null, 2), "utf8");
    console.log(`Ghost config written to ${outPath}`);
  }

  console.log(JSON.stringify(config, null, 2));
}
