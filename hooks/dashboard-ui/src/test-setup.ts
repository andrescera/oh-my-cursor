import '@testing-library/jest-dom/vitest'
import 'vitest-axe/extend-expect'
import * as axeMatchers from 'vitest-axe/matchers'
import { expect } from 'vitest'

// vitest-axe ships matchers as plain functions; extend-expect alone only
// declares the TypeScript ambient types. Extend `expect` so the matchers
// are wired at runtime as well.
expect.extend(axeMatchers)

// Bun's runtime injects a non-functional `localStorage` / `sessionStorage`
// stub on `globalThis` AND on jsdom/happy-dom's `window`, even when no
// `--localstorage-file` is provided (it just warns and gives an empty object).
// That stub shadows the dom environment's working implementation, leaving
// every Storage method undefined. Replace both with a real in-memory shim.

class MemoryStorage implements Storage {
  private store = new Map<string, string>()
  get length(): number { return this.store.size }
  clear(): void { this.store.clear() }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null
  }
  removeItem(key: string): void { this.store.delete(key) }
  setItem(key: string, value: string): void { this.store.set(key, String(value)) }
}

function installStorage(name: 'localStorage' | 'sessionStorage', target: object) {
  Object.defineProperty(target, name, {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
    enumerable: true,
  })
}

installStorage('localStorage', globalThis)
installStorage('sessionStorage', globalThis)
if (typeof window !== 'undefined') {
  installStorage('localStorage', window)
  installStorage('sessionStorage', window)
}
