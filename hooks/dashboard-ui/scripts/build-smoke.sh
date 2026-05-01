#!/usr/bin/env bash
# Three-OS toolchain smoke test (Linux/macOS).
# See hooks/dashboard-ui/SPIKE.md for the W0.2 results table.
set -euo pipefail

cd "$(dirname "$0")/.."

raw_size() {
  wc -c <"$1" | tr -d ' '
}

gzip_size() {
  gzip -c "$1" | wc -c | tr -d ' '
}

now_ms() {
  # GNU date supports %N; macOS BSD date does not. Fall back to python3.
  if date +%s%3N >/dev/null 2>&1 && [[ "$(date +%s%3N)" != *N ]]; then
    date +%s%3N
  else
    python3 -c 'import time; print(int(time.time() * 1000))'
  fi
}

run_build() {
  # Vite writes its build report to stdout. We need to forward that to the
  # user's terminal but keep this function's stdout reserved for the elapsed
  # ms value so the caller can capture it cleanly via $(...).
  local mode="$1"
  local start end elapsed
  start=$(now_ms)
  if [[ "$mode" == "default" ]]; then
    bunx --bun vite build >&2
  else
    bunx --bun vite build --mode "$mode" >&2
  fi
  end=$(now_ms)
  elapsed=$((end - start))
  printf '%s' "$elapsed"
}

echo "==> bun install --frozen-lockfile"
bun install --frozen-lockfile

echo "==> vite build (default mode)"
default_ms=$(run_build default)

js_raw=$(raw_size dist/assets/dashboard.js)
js_gz=$(gzip_size dist/assets/dashboard.js)
css_raw=$(raw_size dist/assets/dashboard.css)
css_gz=$(gzip_size dist/assets/dashboard.css)
html_raw=$(raw_size dist/index.html)
html_gz=$(gzip_size dist/index.html)

echo "--- default mode artifacts ---"
echo "dist/assets/dashboard.js   raw=${js_raw}  gzip=${js_gz}"
echo "dist/assets/dashboard.css  raw=${css_raw} gzip=${css_gz}"
echo "dist/index.html            raw=${html_raw} gzip=${html_gz}"

echo "==> vite build --mode singlefile"
singlefile_ms=$(run_build singlefile)

sf_raw=$(raw_size dist/index.html)
sf_gz=$(gzip_size dist/index.html)

echo "--- singlefile mode artifacts ---"
echo "dist/index.html            raw=${sf_raw} gzip=${sf_gz}"

echo
echo "MODE=default SIZE_RAW=${js_raw} SIZE_GZIP=${js_gz} TIME_MS=${default_ms}"
echo "MODE=singlefile SIZE_RAW=${sf_raw} SIZE_GZIP=${sf_gz} TIME_MS=${singlefile_ms}"
