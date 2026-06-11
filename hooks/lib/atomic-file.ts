import { mkdirSync, renameSync, unlinkSync, writeFileSync, chmodSync } from "node:fs"
import { dirname } from "node:path"

export interface AtomicWriteOptions {
  mode?: number
}

/**
 * Atomically write data to a file using temp+rename pattern.
 * Writes to a temporary file in the same directory, then renames it over the target.
 * Ensures parent directory exists and cleans up temp file on failure.
 *
 * @param path - Target file path
 * @param data - Data to write (string or Buffer)
 * @param opts - Optional: mode to apply via chmod before rename
 */
export function writeFileAtomic(path: string, data: string | Buffer, opts?: AtomicWriteOptions): void {
  const dir = dirname(path)
  const tmpPath = `${path}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`

  try {
    // Ensure parent directory exists
    mkdirSync(dir, { recursive: true })

    // Write to temp file
    writeFileSync(tmpPath, data)

    // Apply mode if specified
    if (opts?.mode !== undefined) {
      chmodSync(tmpPath, opts.mode)
    }

    // Atomic rename
    renameSync(tmpPath, path)
  } catch (error) {
    // Clean up temp file on failure
    try {
      unlinkSync(tmpPath)
    } catch {
      // Ignore cleanup errors
    }
    throw error
  }
}

/**
 * Async variant of writeFileAtomic with identical semantics.
 *
 * @param path - Target file path
 * @param data - Data to write (string or Buffer)
 * @param opts - Optional: mode to apply via chmod before rename
 */
export async function writeFileAtomicAsync(
  path: string,
  data: string | Buffer,
  opts?: AtomicWriteOptions,
): Promise<void> {
  const dir = dirname(path)
  const tmpPath = `${path}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`

  try {
    // Ensure parent directory exists
    mkdirSync(dir, { recursive: true })

    // Write to temp file
    await Bun.write(tmpPath, data)

    // Apply mode if specified
    if (opts?.mode !== undefined) {
      chmodSync(tmpPath, opts.mode)
    }

    // Atomic rename
    renameSync(tmpPath, path)
  } catch (error) {
    // Clean up temp file on failure
    try {
      unlinkSync(tmpPath)
    } catch {
      // Ignore cleanup errors
    }
    throw error
  }
}
