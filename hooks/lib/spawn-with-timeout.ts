export interface SpawnWithTimeoutOptions {
  cwd?: string
  env?: Record<string, string>
  stdin?: string | Uint8Array
  timeoutMs: number
  maxOutputBytes?: number
  signal?: AbortSignal
  killSignal?: "SIGTERM" | "SIGKILL"
}

export interface SpawnWithTimeoutResult {
  exitCode: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  durationMs: number
}

const DEFAULT_MAX_OUTPUT_BYTES = 1_048_576
const SIGKILL_GRACE_MS = 250

function encodeStdin(input: string | Uint8Array): Uint8Array {
  if (typeof input === "string") return new TextEncoder().encode(input)
  return input
}

export async function spawnWithTimeout(
  args: string[],
  options: SpawnWithTimeoutOptions,
): Promise<SpawnWithTimeoutResult> {
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES
  const killSignal = options.killSignal ?? "SIGTERM"
  const startTime = performance.now()

  const stdinPayload = options.stdin === undefined ? undefined : encodeStdin(options.stdin)

  const subprocess = Bun.spawn(args, {
    cwd: options.cwd,
    env: options.env,
    stdin: stdinPayload ?? "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })

  let timedOut = false
  let killEscalationTimer: ReturnType<typeof setTimeout> | null = null

  const requestKill = (): void => {
    timedOut = true
    try {
      subprocess.kill(killSignal)
    } catch {
      // process may already be dead
    }
    if (killEscalationTimer === null) {
      killEscalationTimer = setTimeout(() => {
        try {
          subprocess.kill("SIGKILL")
        } catch {
          // process already exited
        }
      }, SIGKILL_GRACE_MS)
    }
  }

  const timeoutTimer = setTimeout(requestKill, options.timeoutMs)

  let abortHandler: (() => void) | null = null
  if (options.signal) {
    if (options.signal.aborted) {
      requestKill()
    } else {
      abortHandler = requestKill
      options.signal.addEventListener("abort", abortHandler, { once: true })
    }
  }

  let stdoutBytes = 0
  let stderrBytes = 0
  let stdout = ""
  let stderr = ""

  const collect = async (
    stream: ReadableStream<Uint8Array> | undefined,
    onChunk: (chunk: string) => void,
    getCount: () => number,
    setCount: (n: number) => void,
  ): Promise<void> => {
    if (!stream) return
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (!value) continue
        const current = getCount()
        const remaining = maxOutputBytes - current
        if (value.byteLength <= remaining) {
          setCount(current + value.byteLength)
          onChunk(decoder.decode(value, { stream: true }))
          continue
        }
        if (remaining > 0) {
          const truncated = value.subarray(0, remaining)
          setCount(current + truncated.byteLength)
          onChunk(decoder.decode(truncated, { stream: true }))
        }
        requestKill()
        try {
          await reader.cancel()
        } catch {
          // ignore
        }
        break
      }
      const tail = decoder.decode()
      if (tail) onChunk(tail)
    } finally {
      try {
        reader.releaseLock()
      } catch {
        // already released
      }
    }
  }

  if (stdinPayload && subprocess.stdin && typeof (subprocess.stdin as { write?: unknown }).write === "function") {
    const writer = subprocess.stdin as {
      write: (data: Uint8Array) => unknown
      end?: () => unknown
    }
    try {
      writer.write(stdinPayload)
      writer.end?.()
    } catch {
      // child may have closed stdin already
    }
  }

  const stdoutPromise = collect(
    subprocess.stdout as ReadableStream<Uint8Array> | undefined,
    (s) => {
      stdout += s
    },
    () => stdoutBytes,
    (n) => {
      stdoutBytes = n
    },
  )
  const stderrPromise = collect(
    subprocess.stderr as ReadableStream<Uint8Array> | undefined,
    (s) => {
      stderr += s
    },
    () => stderrBytes,
    (n) => {
      stderrBytes = n
    },
  )

  const exitCode = await subprocess.exited
  await Promise.allSettled([stdoutPromise, stderrPromise])

  clearTimeout(timeoutTimer)
  if (killEscalationTimer !== null) clearTimeout(killEscalationTimer)
  if (options.signal && abortHandler) {
    options.signal.removeEventListener("abort", abortHandler)
  }

  return {
    exitCode,
    stdout,
    stderr,
    timedOut,
    durationMs: performance.now() - startTime,
  }
}
