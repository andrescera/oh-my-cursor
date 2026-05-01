#!/usr/bin/env pwsh
# Three-OS toolchain smoke test (Windows VM, NOT WSL).
# See hooks/dashboard-ui/SPIKE.md for the W0.2 results table.

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

function Get-RawSize {
    param([string]$Path)
    return (Get-Item -LiteralPath $Path).Length
}

function Get-GzipSize {
    param([string]$Path)
    $bytes = [System.IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $Path))
    $output = New-Object System.IO.MemoryStream
    $gzip = New-Object System.IO.Compression.GZipStream($output, [System.IO.Compression.CompressionMode]::Compress)
    try {
        $gzip.Write($bytes, 0, $bytes.Length)
    }
    finally {
        $gzip.Dispose()
    }
    $size = $output.Length
    $output.Dispose()
    return $size
}

function Invoke-Build {
    param([string]$Mode)
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    if ($Mode -eq 'default') {
        & bunx --bun vite build
    }
    else {
        & bunx --bun vite build --mode $Mode
    }
    if ($LASTEXITCODE -ne 0) {
        throw "vite build ($Mode) failed with exit code $LASTEXITCODE"
    }
    $sw.Stop()
    return [int64]$sw.ElapsedMilliseconds
}

Write-Host '==> bun install --frozen-lockfile'
& bun install --frozen-lockfile
if ($LASTEXITCODE -ne 0) {
    throw "bun install failed with exit code $LASTEXITCODE"
}

Write-Host '==> vite build (default mode)'
$defaultMs = Invoke-Build -Mode 'default'

$jsRaw  = Get-RawSize  'dist/assets/dashboard.js'
$jsGz   = Get-GzipSize 'dist/assets/dashboard.js'
$cssRaw = Get-RawSize  'dist/assets/dashboard.css'
$cssGz  = Get-GzipSize 'dist/assets/dashboard.css'
$htmlRaw = Get-RawSize  'dist/index.html'
$htmlGz  = Get-GzipSize 'dist/index.html'

Write-Host '--- default mode artifacts ---'
Write-Host ("dist/assets/dashboard.js   raw={0}  gzip={1}" -f $jsRaw, $jsGz)
Write-Host ("dist/assets/dashboard.css  raw={0} gzip={1}" -f $cssRaw, $cssGz)
Write-Host ("dist/index.html            raw={0} gzip={1}" -f $htmlRaw, $htmlGz)

Write-Host '==> vite build --mode singlefile'
$singlefileMs = Invoke-Build -Mode 'singlefile'

$sfRaw = Get-RawSize  'dist/index.html'
$sfGz  = Get-GzipSize 'dist/index.html'

Write-Host '--- singlefile mode artifacts ---'
Write-Host ("dist/index.html            raw={0} gzip={1}" -f $sfRaw, $sfGz)

Write-Host ''
Write-Host ("MODE=default SIZE_RAW={0} SIZE_GZIP={1} TIME_MS={2}" -f $jsRaw, $jsGz, $defaultMs)
Write-Host ("MODE=singlefile SIZE_RAW={0} SIZE_GZIP={1} TIME_MS={2}" -f $sfRaw, $sfGz, $singlefileMs)
