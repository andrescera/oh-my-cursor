#!/usr/bin/env bun
import { createIntrospectionRuntime } from "../lib/introspection-runtime"

async function main(): Promise<void> {
  const runtime = createIntrospectionRuntime()
  await runtime.init()
  process.stdout.write(JSON.stringify(runtime.getSnapshot(), null, 2) + "\n")
}

main().catch((err) => {
  process.stderr.write(`[introspect] ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
