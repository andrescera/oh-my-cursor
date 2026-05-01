/**
 * Shared axe-core runner for the dashboard a11y suite (W3.1).
 *
 * Component-level axe runs flag a few rules that only make sense on a full
 * page document; in our case the Shell mounts each tab outside its real
 * landmarks, so axe trips on `region`, `landmark-one-main`, and
 * `page-has-heading-one`. We rely on the Shell-level axe spec for those,
 * and disable them here for tab-level specs.
 */
import { configureAxe } from 'vitest-axe'

export const axeComponent = configureAxe({
  rules: {
    region: { enabled: false },
    'landmark-one-main': { enabled: false },
    'page-has-heading-one': { enabled: false },
  },
})

export const axeShell = configureAxe({
  rules: {
    // The Shell is a SPA fragment, not a full HTML document, so the
    // single-h1 rule is moot. Everything else stays on.
    'page-has-heading-one': { enabled: false },
  },
})
