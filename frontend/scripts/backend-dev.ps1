<#
.SYNOPSIS
    Run the FastAPI backend for local development.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts/backend-dev.ps1
#>
param(
    [string]$Python = "python",
    [string]$BindHost = "127.0.0.1",
    [int]$Port = 5000,
    [switch]$NoReload
)

$ErrorActionPreference = "Stop"
$Frontend = Split-Path -Parent $PSScriptRoot
$Repo = Split-Path -Parent $Frontend
$Src = Join-Path $Repo "src"

if (-not (Test-Path (Join-Path $Src "main.py"))) {
    throw "Backend entry point not found: $Src\main.py"
}

$env:HOST = $BindHost
$env:PORT = "$Port"
$env:RELOAD = if ($NoReload) { "0" } else { "1" }

Write-Host "Starting backend at http://${BindHost}:$Port (reload=$env:RELOAD)"
Push-Location $Src
try {
    & $Python main.py
} finally {
    Pop-Location
}
