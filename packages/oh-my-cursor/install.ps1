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

$PluginName = "oh-my-cursor"
$PluginId = "$PluginName@local"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

if ($Scope -eq "user") {
    $PluginDir = Join-Path $env:USERPROFILE ".cursor\plugins\local\$PluginName"
    $CursorDir = Join-Path $env:USERPROFILE ".cursor"
} else {
    $PluginDir = ".cursor\plugins\local\$PluginName"
    $CursorDir = ".cursor"
}

$ClaudePlugins = Join-Path $env:USERPROFILE ".claude\plugins\installed_plugins.json"
$ClaudeSettings = Join-Path $env:USERPROFILE ".claude\settings.json"

function Remove-LooseFiles {
    $looseFiles = @(
        "agents\sisyphus.md", "agents\hephaestus.md", "agents\oracle.md",
        "agents\librarian.md", "agents\explore.md", "agents\multimodal-looker.md",
        "agents\metis.md", "agents\momus.md", "agents\atlas.md",
        "agents\prometheus.md", "agents\sisyphus-junior.md",
        "agents\protocols\coordinator.md",
        "rules\orchestrator.mdc", "rules\coding-standards.mdc",
        "rules\anti-patterns.mdc", "rules\modular-code-enforcement.mdc",
        "commands\cancel-ralph.md", "commands\handoff.md", "commands\init-deep.md",
        "commands\deep-plan.md", "commands\ralph-loop.md", "commands\refactor.md",
        "commands\remove-ai-slops.md", "commands\start-work.md", "commands\stop-continuation.md",
        "hooks.json",
        "hooks\daemon.ts", "hooks\mcp-sidecar.ts"
    )

    foreach ($rel in $looseFiles) {
        $p = Join-Path $CursorDir $rel
        if (Test-Path $p) {
            if ($DryRun) { Write-Host "[dry-run] Would remove: $p" }
            else { Remove-Item $p -Force; Write-Host "[removed] $p" }
        }
    }

    $looseDirs = @("hooks\scripts")
    foreach ($rel in $looseDirs) {
        $p = Join-Path $CursorDir $rel
        if (Test-Path $p) {
            if ($DryRun) { Write-Host "[dry-run] Would remove: $p" }
            else { Remove-Item $p -Recurse -Force; Write-Host "[removed] $p" }
        }
    }

    $looseSkills = @("agent-browser", "ai-slop-remover", "dev-browser", "frontend-ui-ux", "git-master", "review-work")
    foreach ($s in $looseSkills) {
        $p = Join-Path $CursorDir "skills\$s"
        if (Test-Path $p) {
            if ($DryRun) { Write-Host "[dry-run] Would remove: $p" }
            else { Remove-Item $p -Recurse -Force; Write-Host "[removed] $p" }
        }
    }
}

function Read-JsonSafe {
    param([string]$Path, [PSCustomObject]$Default)
    if (-not (Test-Path $Path)) { return $Default }
    try {
        $raw = Get-Content $Path -Raw
        if ([string]::IsNullOrWhiteSpace($raw)) { return $Default }
        return $raw | ConvertFrom-Json
    } catch {
        Write-Warning "Malformed JSON at $Path, treating as empty."
        return $Default
    }
}

function Write-JsonSafe {
    param([string]$Path, [object]$Data)
    $dir = Split-Path -Parent $Path
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $Data | ConvertTo-Json -Depth 10 | Set-Content $Path -Encoding UTF8
}

if ($Uninstall) {
    Write-Host "Uninstalling $PluginName..."
    Write-Host ""

    Write-Host "==> Removing plugin directory"
    if (Test-Path $PluginDir) {
        if ($DryRun) { Write-Host "[dry-run] Would remove: $PluginDir" }
        else { Remove-Item $PluginDir -Recurse -Force; Write-Host "[removed] $PluginDir" }
    } else {
        Write-Host "[skip] $PluginDir not found"
    }

    Write-Host ""
    Write-Host "==> Deregistering from installed_plugins.json"
    if ($DryRun) {
        Write-Host "[dry-run] Would remove $PluginId from $ClaudePlugins"
    } else {
        $defaultReg = [PSCustomObject]@{ version = 2; plugins = [PSCustomObject]@{} }
        $reg = Read-JsonSafe $ClaudePlugins $defaultReg
        $existing = $reg.plugins.PSObject.Properties[$PluginId]
        if ($existing) {
            $reg.plugins.PSObject.Properties.Remove($PluginId)
            Write-JsonSafe $ClaudePlugins $reg
            Write-Host "[ok] Removed $PluginId from $ClaudePlugins"
        } else {
            Write-Host "[skip] $PluginId not found in $ClaudePlugins"
        }
    }

    Write-Host ""
    Write-Host "==> Disabling in settings.json"
    if ($DryRun) {
        Write-Host "[dry-run] Would disable $PluginId in $ClaudeSettings"
    } else {
        $cfg = Read-JsonSafe $ClaudeSettings ([PSCustomObject]@{})
        if ($cfg.enabledPlugins -and $cfg.enabledPlugins.PSObject.Properties[$PluginId]) {
            $cfg.enabledPlugins.PSObject.Properties.Remove($PluginId)
            Write-JsonSafe $ClaudeSettings $cfg
            Write-Host "[ok] Disabled $PluginId in $ClaudeSettings"
        } else {
            Write-Host "[skip] $PluginId not found in $ClaudeSettings"
        }
    }

    Write-Host ""
    Write-Host "==> Cleaning up old loose files"
    Remove-LooseFiles

    Write-Host ""
    Write-Host "Done."
    exit 0
}

Write-Host "Installing $PluginName (scope: $Scope)..."
Write-Host ""

Write-Host "==> Step 1: Cleaning up old loose files"
Remove-LooseFiles

Write-Host ""
Write-Host "==> Step 2: Copying plugin package"

if ((Test-Path $PluginDir) -and (-not $Force)) {
    Write-Host "ERROR: $PluginDir already exists. Use -Force to overwrite." -ForegroundColor Red
    exit 1
}

if ($DryRun) {
    Write-Host "[dry-run] Would copy plugin package from $ScriptDir to $PluginDir"
} else {
    if (Test-Path $PluginDir) {
        Remove-Item $PluginDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $PluginDir -Force | Out-Null

    $dirs = @(".cursor-plugin", "agents", "commands", "rules", "skills", "hooks", "scripts", "automations")
    foreach ($d in $dirs) {
        $src = Join-Path $ScriptDir $d
        if (Test-Path $src) {
            Copy-Item -Path $src -Destination $PluginDir -Recurse -Force
            Write-Host "[ok] $d\"
        }
    }

    $files = @("mcp.json", "sandbox.json", "README.md", "DEEPLINKS.md", "worktrees.json")
    foreach ($f in $files) {
        $src = Join-Path $ScriptDir $f
        if (Test-Path $src) {
            Copy-Item -Path $src -Destination (Join-Path $PluginDir $f) -Force
            Write-Host "[ok] $f"
        }
    }

    Write-Host "[ok] Plugin package installed to $PluginDir"
}

Write-Host ""
Write-Host "==> Step 3: Registering in installed_plugins.json"

if ($DryRun) {
    Write-Host "[dry-run] Would register $PluginId -> $PluginDir in $ClaudePlugins"
} else {
    $resolvedPath = if (Test-Path $PluginDir) { (Resolve-Path $PluginDir).Path } else { $PluginDir }

    $defaultReg = [PSCustomObject]@{ version = 2; plugins = [PSCustomObject]@{} }
    $reg = Read-JsonSafe $ClaudePlugins $defaultReg

    if ($null -eq $reg.version) {
        $reg | Add-Member -NotePropertyName "version" -NotePropertyValue 2 -Force
    }
    if ($null -eq $reg.plugins) {
        $reg | Add-Member -NotePropertyName "plugins" -NotePropertyValue ([PSCustomObject]@{}) -Force
    }

    $entry = @([PSCustomObject]@{ scope = $Scope; installPath = $resolvedPath })
    $reg.plugins | Add-Member -NotePropertyName $PluginId -NotePropertyValue $entry -Force

    Write-JsonSafe $ClaudePlugins $reg
    Write-Host "[ok] $ClaudePlugins"
}

Write-Host ""
Write-Host "==> Step 4: Enabling in settings.json"

if ($DryRun) {
    Write-Host "[dry-run] Would set enabledPlugins.$PluginId = true in $ClaudeSettings"
} else {
    $cfg = Read-JsonSafe $ClaudeSettings ([PSCustomObject]@{})
    if ($null -eq $cfg.enabledPlugins) {
        $cfg | Add-Member -NotePropertyName "enabledPlugins" -NotePropertyValue ([PSCustomObject]@{}) -Force
    }
    $cfg.enabledPlugins | Add-Member -NotePropertyName $PluginId -NotePropertyValue $true -Force

    Write-JsonSafe $ClaudeSettings $cfg
    Write-Host "[ok] $ClaudeSettings"
}

Write-Host ""
Write-Host "oh-my-cursor installed successfully!"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Restart Cursor (Ctrl+Shift+P > `"Reload Window`" or full restart)"
Write-Host "  2. Enable `"Include third-party Plugins`" in Settings > Features (if not already on)"
Write-Host "  3. Try: /deep-plan add authentication to my app"
Write-Host "  4. Try: @sisyphus fix the failing tests"
