# CLI Facts — Cursor 3.6.21

> Captured 2026-05-29. Binary: `/usr/bin/cursor`. Version: **3.6.21** (commit `e7a7e93f4d75f8272503ecf33cedbaae10114a10`, x64). Host: Linux. Headless agent binary `~/.local/bin/agent` is **absent** on this host.

---

## `cursor --version`

**Command:** `cursor --version`

```text
Warning: 'disable-oom-score-adj' is not in the list of known options, but still passed to Electron/Chromium.
3.6.21
e7a7e93f4d75f8272503ecf33cedbaae10114a10
x64
```

---

## `cursor --help`

**Command:** `cursor --help`

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

---

## `cursor agent --help`

**Command:** `cursor agent --help`

**Observed behavior:** `cursor agent --help` on this host (where `~/.local/bin/agent` is absent) does **not** dispatch to a headless agent CLI. Instead it falls back and prints the **IDE binary's own top-level usage block** (identical to `cursor --help`). The `agent` token is treated as a path argument and ignored; no nested agent-specific flags are shown. Exit code: 0.

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

---

## `cursor agent models`

**Command:** `cursor agent models`

**Observed behavior:** Printed only the Chromium warning; no model list output. Exit code: 0. Because `~/.local/bin/agent` is absent, the command does not dispatch to the headless agent CLI. Model list is **unavailable / requires headless agent binary**.

```text
Warning: 'disable-oom-score-adj' is not in the list of known options, but still passed to Electron/Chromium.
```

*(No further output.)*

---

## `cursor agent --list-models`

**Command:** `cursor agent --list-models`

**Observed behavior:** The `--list-models` flag is not recognized by the IDE binary. Electron/Chromium forwarding warning emitted. No model list. Exit code: 0.

```text
Warning: 'disable-oom-score-adj' is not in the list of known options, but still passed to Electron/Chromium.
Warning: 'list-models' is not in the list of known options, but still passed to Electron/Chromium.
```

*(No further output.)*

---

## `cursor agent acp --help`

**Command:** `cursor agent acp --help`

**Observed behavior:** Falls back to IDE usage block (same as `cursor --help`). The `acp` and `--help` tokens are passed as args; no ACP-specific subcommand help is surfaced. Exit code: 0.

```text
Warning: 'disable-oom-score-adj' is not in the list of known options, but still passed to Electron/Chromium.
Cursor 3.6.21

Usage: cursor [options][paths...]
[...same IDE block as cursor --help above — not repeated for brevity...]
```

---

## Notable diff vs 3.0.16

| Area | 3.0.16 | 3.6.21 |
| --- | --- | --- |
| Version string | `Cursor 3.0.16` | `Cursor 3.6.21` |
| Commit hash | *(not captured)* | `e7a7e93f4d75f8272503ecf33cedbaae10114a10` |
| `--reuse-window` description | "Open a file or folder in an already opened window." | "**Force** to open a file or folder in an already opened window." |
| `--chat` flag | absent | **new**: "Open a standalone chat window without the full IDE." |
| `serve-web` subcommand | present | **removed** |
| `cursor agent --help` behavior | IDE block (same fallback) | IDE block (unchanged fallback — no headless agent) |
| Model list via CLI | *(requires headless agent)* | **unavailable** (headless agent absent) |
