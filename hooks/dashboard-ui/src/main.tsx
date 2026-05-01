import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import App from './App'
import './index.css'

let root: Root | null = null

// The MCP daemon shell at hooks/mcp-app.ts loads this bundle for side effect
// (no `.then(m => m.boot(...))`); the auto-boot below mounts the React app
// when the bundle runs. The function is wrapped in a guard so multiple
// imports (eg. dev HMR) don't double-render.
function boot(rootSelector: string = '#app'): void {
  if (root) return
  const container = document.querySelector(rootSelector)
  if (!container) throw new Error(`Root element ${rootSelector} not found`)
  root = createRoot(container as HTMLElement)
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

if (typeof document !== 'undefined' && document.getElementById('app')) {
  boot('#app')
}
