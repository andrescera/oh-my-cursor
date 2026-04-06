# oh-my-cursor installer for Windows
# Usage: .\install.ps1 [-Scope project] [-Force] [-DryRun] [-Uninstall]

param(
    [ValidateSet("user", "project")]
    [string]$Scope = "user",
    [switch]$Force,
    [switch]$DryRun,
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'

if ($Scope -eq "user") {
    $Dest = Join-Path $env:USERPROFILE ".cursor"
} else {
    $Dest = ".cursor"
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Copy-PluginFile {
    param([string]$Src, [string]$Dst)
    if ($DryRun) {
        Write-Host "[dry-run] Would copy: $Src -> $Dst"
        return
    }
    if ((Test-Path $Dst) -and (-not $Force)) {
        Write-Host "[skip] $Dst already exists (use -Force to overwrite)"
        return
    }
    $dir = Split-Path -Parent $Dst
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    Copy-Item -Path $Src -Destination $Dst -Force
    Write-Host "[ok] $Dst"
}

if ($Uninstall) {
    Write-Host "Uninstalling oh-my-cursor..."
    $agents = @("sisyphus","hephaestus","oracle","librarian","explore","multimodal-looker","metis","momus","atlas","prometheus","sisyphus-junior")
    foreach ($a in $agents) {
        $p = Join-Path $Dest "agents\$a.md"
        if (Test-Path $p) { Remove-Item $p -Force; Write-Host "[removed] $p" }
    }
    $protocolDir = Join-Path $Dest "agents\protocols"
    if (Test-Path $protocolDir) { Remove-Item $protocolDir -Recurse -Force; Write-Host "[removed] $protocolDir" }

    $rules = @("orchestrator","coding-standards","anti-patterns","modular-code-enforcement")
    foreach ($r in $rules) {
        $p = Join-Path $Dest "rules\$r.mdc"
        if (Test-Path $p) { Remove-Item $p -Force; Write-Host "[removed] $p" }
    }

    $hooksDir = Join-Path $Dest "hooks"
    if (Test-Path $hooksDir) { Remove-Item $hooksDir -Recurse -Force; Write-Host "[removed] $hooksDir" }

    $hooksJson = Join-Path $Dest "hooks.json"
    if (Test-Path $hooksJson) { Remove-Item $hooksJson -Force; Write-Host "[removed] $hooksJson" }

    Write-Host "Done. oh-my-cursor files removed."
    exit 0
}

Write-Host "Installing oh-my-cursor (scope: $Scope)..."
Write-Host ""

Write-Host "==> Agents"
$agents = @("sisyphus","hephaestus","oracle","librarian","explore","multimodal-looker","metis","momus","atlas","prometheus","sisyphus-junior")
foreach ($a in $agents) {
    Copy-PluginFile (Join-Path $ScriptDir "agents\$a.md") (Join-Path $Dest "agents\$a.md")
}
Copy-PluginFile (Join-Path $ScriptDir "agents\protocols\coordinator.md") (Join-Path $Dest "agents\protocols\coordinator.md")

Write-Host ""
Write-Host "==> Rules"
$rules = @("orchestrator","coding-standards","anti-patterns","modular-code-enforcement")
foreach ($r in $rules) {
    Copy-PluginFile (Join-Path $ScriptDir "rules\$r.mdc") (Join-Path $Dest "rules\$r.mdc")
}

Write-Host ""
Write-Host "==> Commands"
$cmds = @("ralph-loop","start-work","refactor","init-deep","handoff","stop-continuation","remove-ai-slops","plan","cancel-ralph")
foreach ($c in $cmds) {
    Copy-PluginFile (Join-Path $ScriptDir "commands\$c.md") (Join-Path $Dest "commands\$c.md")
}

Write-Host ""
Write-Host "==> Skills"
$skills = @("git-master","frontend-ui-ux","dev-browser","agent-browser","review-work","ai-slop-remover")
foreach ($s in $skills) {
    $srcDir = Join-Path $ScriptDir "skills\$s"
    if (Test-Path $srcDir) {
        $dstDir = Join-Path $Dest "skills\$s"
        if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Path $dstDir -Force | Out-Null }
        Copy-Item -Path "$srcDir\*" -Destination $dstDir -Recurse -Force
        Write-Host "[ok] $dstDir"
    }
}

Write-Host ""
Write-Host "==> Hooks"
Copy-PluginFile (Join-Path $ScriptDir "hooks\daemon.ts") (Join-Path $Dest "hooks\daemon.ts")
Copy-PluginFile (Join-Path $ScriptDir "hooks\hooks.json") (Join-Path $Dest "hooks.json")
$scriptsDir = Join-Path $Dest "hooks\scripts"
if (-not (Test-Path $scriptsDir)) { New-Item -ItemType Directory -Path $scriptsDir -Force | Out-Null }
Copy-PluginFile (Join-Path $ScriptDir "hooks\scripts\start-daemon.sh") (Join-Path $Dest "hooks\scripts\start-daemon.sh")
Copy-PluginFile (Join-Path $ScriptDir "hooks\scripts\context-injector.ts") (Join-Path $Dest "hooks\scripts\context-injector.ts")

Write-Host ""
Write-Host "==> MCP Sidecar"
Copy-PluginFile (Join-Path $ScriptDir "hooks\mcp-sidecar.ts") (Join-Path $Dest "hooks\mcp-sidecar.ts")

Write-Host ""
Write-Host "oh-my-cursor installed successfully!"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Open a project in Cursor"
Write-Host "  2. The orchestrator rule will activate automatically"
Write-Host "  3. Try: /plan add authentication to my app"
Write-Host "  4. Try: @sisyphus fix the failing tests"
