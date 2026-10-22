<#
.SYNOPSIS
    Build the bundled Windows backend executable with PyInstaller.

.DESCRIPTION
    Installs Python dependencies (unless -SkipInstall is supplied) and writes
    build\backend\MiniRAGBackend.exe, which electron-builder copies into the
    installer resources\backend directory.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts/build-backend.ps1
#>
param(
    [string]$Python = "python",
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
$Frontend = Split-Path -Parent $PSScriptRoot
$Repo = Split-Path -Parent $Frontend
$Requirements = Join-Path $Repo "src\requirements.txt"
$Spec = Join-Path $PSScriptRoot "backend.spec"
$Dist = Join-Path $Frontend "build\backend"
$Work = Join-Path $Frontend "build\pyinstaller"

if (-not (Test-Path $Requirements)) {
    throw "Requirements file not found: $Requirements"
}

Write-Host "Using Python: $(& $Python --version)"

if (-not $SkipInstall) {
    & $Python -m pip install --upgrade pip
    if ($LASTEXITCODE -ne 0) { throw "pip upgrade failed" }
    & $Python -m pip install -r $Requirements
    if ($LASTEXITCODE -ne 0) { throw "dependency installation failed" }
    & $Python -m pip install "pyinstaller==6.11.1"
    if ($LASTEXITCODE -ne 0) { throw "PyInstaller installation failed" }
}

if (Test-Path $Dist) {
    Remove-Item -Recurse -Force $Dist
}
New-Item -ItemType Directory -Force -Path $Dist | Out-Null

& $Python -m PyInstaller `
    --noconfirm `
    --clean `
    --distpath $Dist `
    --workpath $Work `
    $Spec
if ($LASTEXITCODE -ne 0) { throw "PyInstaller build failed" }

$Exe = Join-Path $Dist "MiniRAGBackend.exe"
if (-not (Test-Path $Exe)) {
    throw "Expected backend executable was not created: $Exe"
}

Write-Host "Built $Exe"
