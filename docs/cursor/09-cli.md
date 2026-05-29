# CLI

> Cursor 3.0.16. Evidence tags per claim.

Evidence tags: `[official-doc]`, `[changelog]`, `[repro-local]`, `[binary-only]`, `[community]`.

## Captured `--help` output (this host)

**Environment:** Cursor **3.6.21** (commit `e7a7e93f4d75f8272503ecf33cedbaae10114a10`, x64); IDE launcher `/usr/bin/cursor`; headless **`agent`** binary `~/.local/bin/agent` is **absent** on this host (captured 2026-05-29). Warnings emitted by Chromium flag forwarding may appear on stderr. [repro-local]

`cursor --help` returns the IDE’s top-level help block. On this host, **`cursor agent --help`** falls back to the same IDE usage block — no nested agent flag list is surfaced — because the headless agent binary is absent. The agent-specific flags documented below (§ agent --help) were captured at **3.0.16** with the agent binary present and are labeled accordingly. [repro-local]

### `cursor` (IDE binary) -- full `--help`

```text
Warning: 'disable-oom-score-adj' is not in the list of known options, but still passed to Electron/Chromium.
Cursor 3.6.21

Usage: cursor [options][paths...]

To read from stdin, append '-' (e.g. 'ps aux | grep code | cursor -')

Options
  -d --diff <file> <file>                    Compare two files with each
                                             other.
  -m --merge <path1> <path2> <base> <result> Perform a three-way merge by
                                             providing paths for two modified
                                             versions of a file, the common
                                             origin of both modified versions
                                             and the output file to save merge
                                             results.
  -a --add <folder>                          Add folder(s) to the last active
                                             window.
  --remove <folder>                          Remove folder(s) from the last
                                             active window.
  -g --goto <file:line[:character]>          Open a file at the path on the
                                             specified line and character
                                             position.
  -n --new-window                            Force to open a new window.
  -r --reuse-window                          Force to open a file or folder in
                                             an already opened window.
  --suppress-popups-on-startup               Suppress notification popups on
                                             startup.
  --web-worker-exthost                       Run all web-capable extensions in
                                             a web worker extension host.
  --glass                                    Enable the multi-workbench
                                             architecture (dev-only).
  --classic                                  Disable glass mode and force
                                             classic windows (dev-only).
  -w --wait                                  Wait for the files to be closed
                                             before returning.
  --locale <locale>                          The locale to use (e.g. en-US or
                                             zh-TW).
  --user-data-dir <dir>                      Specifies the directory that user
                                             data is kept in. Can be used to
                                             open multiple distinct instances
                                             of Code.
  --profile <profileName>                    Opens the provided folder or
                                             workspace with the given profile
                                             and associates the profile with
                                             the workspace. If the profile does
                                             not exist, a new empty one is
                                             created.
  -h --help                                  Print usage.
  --add-mcp <json>                           Adds a Model Context Protocol
                                             server definition to the user
                                             profile, or workspace or folder
                                             when used with --mcp-workspace.
                                             Accepts JSON input in the form
                                             '{"name":"server-name","command":...}
                                             '
  --chat                                     Open a standalone chat window
                                             without the full IDE.

Extensions Management
  --extensions-dir <dir>              Set the root path for extensions.
  --list-extensions                   List the installed extensions.
  --show-versions                     Show versions of installed extensions,
                                      when using --list-extensions.
  --category <category>               Filters installed extensions by provided
                                      category, when using --list-extensions.
  --install-extension <ext-id | path> Installs or updates an extension. The
                                      argument is either an extension id or a
                                      path to a VSIX. The identifier of an
                                      extension is '${publisher}.${name}'. Use
                                      '--force' argument to update to latest
                                      version. To install a specific version
                                      provide '@${version}'. For example:
                                      'vscode.csharp@1.2.3'.
  --pre-release                       Installs the pre-release version of the
                                      extension, when using
                                      --install-extension
  --uninstall-extension <ext-id>      Uninstalls an extension.
  --update-extensions                 Update the installed extensions.
  --enable-proposed-api <ext-id>      Enables proposed API features for
                                      extensions. Can receive one or more
                                      extension IDs to enable individually.

Troubleshooting
  -v --version                            Print version.
  --verbose                               Print verbose output (implies
                                          --wait).
  --log <level>                           Log level to use. Default is 'info'.
                                          Allowed values are 'critical',
                                          'error', 'warn', 'info', 'debug',
                                          'trace', 'off'. You can also
                                          configure the log level of an
                                          extension by passing extension id and
                                          log level in the following format:
                                          '${publisher}.${name}:${logLevel}'.
                                          For example: 'vscode.csharp:trace'.
                                          Can receive one or more such
                                          entries.
  -s --status                             Print process usage and diagnostics
                                          information.
  --prof-startup                          Run CPU profiler during startup.
  --disable-extensions                    Disable all installed extensions.
                                          This option is not persisted and is
                                          effective only when the command opens
                                          a new window.
  --disable-extension <ext-id>            Disable the provided extension. This
                                          option is not persisted and is
                                          effective only when the command opens
                                          a new window.
  --sync <on | off>                       Turn sync on or off.
  --inspect-extensions <port>             Allow debugging and profiling of
                                          extensions. Check the developer tools
                                          for the connection URI.
  --inspect-brk-extensions <port>         Allow debugging and profiling of
                                          extensions with the extension host
                                          being paused after start. Check the
                                          developer tools for the connection
                                          URI.
  --disable-lcd-text                      Disable LCD font rendering.
  --disable-gpu                           Disable GPU hardware acceleration.
  --disable-chromium-sandbox              Use this option only when there is
                                          requirement to launch the application
                                          as sudo user on Linux or when running
                                          as an elevated user in an applocker
                                          environment on Windows.
  --locate-shell-integration-path <shell> Print the path to a terminal shell
                                          integration script. Allowed values
                                          are 'bash', 'pwsh', 'zsh' or 'fish'.
  --telemetry                             Shows all telemetry events which VS
                                          code collects.

Subcommands
  tunnel       Make the current machine accessible from vscode.dev or other
               machines through a secure tunnel
  agent        Start the Cursor agent in your terminal.
```

[repro-local]

### `agent` -- full `--help` (headless Cursor Agent CLI) — captured at 3.0.16; not reproducible on this host at 3.6.21

```text
Usage: agent [options] [command] [prompt...]

Start the Cursor Agent

Arguments:
  prompt                       Initial prompt for the agent

Options:
  -v, --version                Output the version number
  --api-key <key>              API key for authentication (can also use
                               CURSOR_API_KEY env var)
  -H, --header <header>        Add custom header to agent requests (format:
                               'Name: Value', can be used multiple times)
  -p, --print                  Print responses to console (for scripts or
                               non-interactive use). Has access to all tools,
                               including write and shell. (default: false)
  --output-format <format>     Output format (only works with --print): text |
                               json | stream-json (default: "text")
  --stream-partial-output      Stream partial output as individual text deltas
                               (only works with --print and stream-json format)
                               (default: false)
  -c, --cloud                  Start in cloud mode (open composer picker on
                               launch) (default: false)
  --mode <mode>                Start in the given execution mode. plan:
                               read-only/planning (analyze, propose plans, no
                               edits). ask: Q&A style for explanations and
                               questions (read-only). (choices: "plan", "ask")
  --plan                       Start in plan mode (shorthand for --mode=plan).
                               Ignored if --cloud is passed. (default: false)
  --resume [chatId]            Select a session to resume (default: false)
  --continue                   Continue previous session (default: false)
  --model <model>              Model to use (e.g., gpt-5, sonnet-4,
                               sonnet-4-thinking)
  --list-models                List available models and exit (default: false)
  -f, --force                  Force allow commands unless explicitly denied
                               (default: false)
  --yolo                       Alias for --force (Run Everything) (default:
                               false)
  --sandbox <mode>             Explicitly enable or disable sandbox mode
                               (overrides config) (choices: "enabled",
                               "disabled")
  --approve-mcps               Automatically approve all MCP servers (default:
                               false)
  --trust                      Trust the current workspace without prompting
                               (only works with --print/headless mode) (default:
                               false)
  --workspace <path>           Workspace directory to use (defaults to current
                               working directory)
  -w, --worktree [name]        Start in an isolated git worktree at
                               ~/.cursor/worktrees/<reponame>/<name>. If
                               omitted, a name is generated.
  --worktree-base <branch>     Branch or ref to base the new worktree on
                               (default: current HEAD)
  --skip-worktree-setup        Skip running worktree setup scripts from
                               .cursor/worktrees.json (default: false)
  -h, --help                   Display help for command

Commands:
  install-shell-integration    Install shell integration to ~/.zshrc
  uninstall-shell-integration  Remove shell integration from ~/.zshrc
  login                        Authenticate with Cursor. Set NO_OPEN_BROWSER to
                               disable browser opening.
  logout                       Sign out and clear stored authentication
  mcp                          Manage MCP servers
  status|whoami                View authentication status
  models                       List available models for this account
  about                        Display version, system, and account information
  update                       Update Cursor Agent to the latest version
  create-chat                  Create a new empty chat and return its ID
  generate-rule|rule           Generate a new Cursor rule with interactive
                               prompts
  agent [prompt...]            Start the Cursor Agent
  ls                           Resume a chat session
  resume                       Resume the latest chat session
  help [command]               Display help for command
```

[repro-local]

### `agent acp` -- `--help` — captured at 3.0.16; not reproducible on this host at 3.6.21

```text
Usage: agent acp [options]

Start the Cursor Agent as an ACP (Agent Client Protocol) server

Options:
  -h, --help  Display help for command
```

[repro-local]

## Agent CLI flags (documented elsewhere)

These flags appear in **`agent --help`** and are summarized in Cursor’s CLI documentation: **`--print`**, **`--output-format`** (`text` | `json` | `stream-json`), **`--stream-partial-output`**, **`--cloud`**, **`--resume`**, **`--model`**, **`--mode`** (`plan` | `ask`), **`--plan`**, **`--force`** / **`--yolo`**, **`--sandbox`**, **`--worktree`** (plus **`--worktree-base`**, **`--skip-worktree-setup`**). [official-doc] + [repro-local]

## Configuration files

- **User:** `~/.cursor/cli-config.json` [official-doc]
- **Workspace:** `.cursor/cli.json` [official-doc]

## Environment

- **`CURSOR_API_KEY`** — documented authentication path for CLI / API-style use. [official-doc]

## IDE launcher flag files

The **`cursor`** shell launcher (as installed under `/usr/share/cursor/` on this Linux host) reads optional Chromium/Electron flag files:

- `${XDG_CONFIG_HOME:-$HOME/.config}/cursor-flags.conf`
- Fallback: `${XDG_CONFIG_HOME:-$HOME/.config}/electron-flags.conf`

[repro-local]
