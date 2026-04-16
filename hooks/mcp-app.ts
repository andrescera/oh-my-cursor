import { renderDashboardHTML } from "./dashboard/render"
import { getDaemonPort } from "./port-manager"

const DEFAULT_PORT = parseInt(process.env.OH_MY_CURSOR_PORT || "47847")

let statusHtmlCache: string | null = null

export function getStatusHTML(port?: number): string {
  const effectivePort = port ?? getDaemonPort(Number.isNaN(DEFAULT_PORT) ? 47847 : DEFAULT_PORT)
  statusHtmlCache = renderDashboardHTML(effectivePort)
  return statusHtmlCache
}

export const STATUS_HTML = getStatusHTML()
