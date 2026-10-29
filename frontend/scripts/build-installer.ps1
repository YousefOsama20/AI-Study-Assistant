<#
.SYNOPSIS
    Build the renderer, Electron main process, bundled backend, and NSIS
    installer in one pass.

.DESCRIPTION
    Runs TypeScript checks and frontend tests, builds the self-contained
    backend executable, builds the renderer and Electron main process, then
    packages the Windows installer with electron-builder. The resulting
    installer and unpacked application are validated, and SHA-256 checksums
    are written to frontend\dist\SHA256SUMS.txt.

.PARAMETER Python
    Base Python 3.12 interpreter used to create the backend build environment.

.PARAMETER SkipTests
    Skip the frontend test suite (type checking still runs).

.PARAMETER SkipBackend
    Reuse an existing backend executable in build\backend instead of rebuilding.

.PARAMETER SkipInstall
    Do not create/update npm or Python dependencies; requires existing
    node_modules and backend build environment.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts/build-installer.ps1

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts/build-installer.ps1 -SkipTests
#>
param(
    [string]$Python = "python",
    [switch]$SkipTests,
    [switch]$SkipBackend,
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"

$Frontend = Split-Path -Parent $PSScriptRoot
$Repo = Split-Path -Parent $Frontend
$Dist = Join-Path $Frontend "dist"
$BackendExe = Join-Path $Frontend "build\backend\AIStudyAssistantBackend.exe"
$ComposeFile = Join-Path $Repo "docker\docker-compose.yml"

if (-not (Test-Path (Join-Path $Repo "src\main.py"))) {
    throw "Backend entry point not found. Run this script from a full repository checkout."
}
if (-not (Test-Path $ComposeFile)) {
    throw "docker\docker-compose.yml is missing; the installer would not include the database service."
}

Push-Location $Frontend
try {
    # --- Node dependencies -------------------------------------------------
    if (-not (Test-Path "node_modules")) {
        if ($SkipInstall) {
            throw "node_modules is missing and -SkipInstall was supplied."
        }
        if (Test-Path "package-lock.json") {
            npm ci --no-audit --no-fund
        } else {
            npm install --no-audit --no-fund
        }
        if ($LASTEXITCODE -ne 0) { throw "npm dependency installation failed." }
    }

    # --- Validation --------------------------------------------------------
    Write-Host "Running TypeScript checks..."
    npm run typecheck
    if ($LASTEXITCODE -ne 0) { throw "TypeScript check failed." }

    if (-not $SkipTests) {
        Write-Host "Running frontend tests..."
        npm run test
        if ($LASTEXITCODE -ne 0) { throw "Frontend tests failed." }
    }

    # --- Backend -----------------------------------------------------------
    if (-not $SkipBackend) {
        & (Join-Path $PSScriptRoot "build-backend.ps1") -Python $Python
        if ($LASTEXITCODE -ne 0) { throw "Backend build failed." }
    }
    if (-not (Test-Path $BackendExe)) {
        throw "Backend executable not found: $BackendExe"
    }

    # --- Renderer and Electron main process --------------------------------
    Write-Host "Building renderer..."
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Renderer build failed." }

    Write-Host "Building Electron main process..."
    npm run build:electron
    if ($LASTEXITCODE -ne 0) { throw "Electron build failed." }

    # --- Package -----------------------------------------------------------
    # Never attempt to discover a local code-signing certificate during local
    # builds. Set CSC_LINK/CSC_KEY_PASSWORD to sign a release build explicitly.
    if (-not $env:CSC_LINK) {
        $env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
    }

    Write-Host "Packaging Windows installer..."
    npx electron-builder --win --publish never
    if ($LASTEXITCODE -ne 0) { throw "NSIS installer build failed." }

    # --- Validate artifacts ------------------------------------------------
    $Package = Get-Content (Join-Path $Frontend "package.json") -Raw | ConvertFrom-Json
    $Installer = Join-Path $Dist ("AI-Study-Assistant Setup {0}.exe" -f $Package.version)
    $Unpacked = Join-Path $Dist "win-unpacked"
    $PackedBackend = Join-Path $Unpacked "resources\backend\AIStudyAssistantBackend.exe"
    $PackedCompose = Join-Path $Unpacked "resources\docker\docker-compose.yml"
    $PackedApp = Join-Path $Unpacked "AI-Study-Assistant.exe"

    foreach ($Path in @($Installer, $PackedApp, $PackedBackend, $PackedCompose)) {
        if (-not (Test-Path $Path)) {
            throw "Expected build artifact is missing: $Path"
        }
    }

    $InstallerSize = (Get-Item $Installer).Length
    if ($InstallerSize -lt 50MB) {
        throw "Installer is unexpectedly small ($([math]::Round($InstallerSize / 1MB, 1)) MB)."
    }

    $Hash = (Get-FileHash -Algorithm SHA256 -Path $Installer).Hash.ToLowerInvariant()
    $ChecksumFile = Join-Path $Dist "SHA256SUMS.txt"
    Set-Content -Path $ChecksumFile -Value ("$Hash  {0}" -f (Split-Path -Leaf $Installer)) -Encoding ASCII

    Write-Host ""
    Write-Host "Installer: $Installer"
    Write-Host ("Size:      {0:N1} MB" -f ($InstallerSize / 1MB))
    Write-Host "SHA256:    $Hash"
    Write-Host "Checksums: $ChecksumFile"
    Write-Host "Unpacked:  $Unpacked"
} finally {
    Pop-Location
}
