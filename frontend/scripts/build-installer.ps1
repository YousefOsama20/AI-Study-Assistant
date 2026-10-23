<#
.SYNOPSIS
    Build the renderer, Electron main process, backend executable, and NSIS
    installer in one pass.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts/build-installer.ps1
#>
param(
    [string]$Python = "python",
    [switch]$SkipTests,
    [switch]$SkipBackend
)

$ErrorActionPreference = "Stop"
$Frontend = Split-Path -Parent $PSScriptRoot

pushd $Frontend
try {
    if (-not (Test-Path "node_modules")) {
        npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
    }

    npm run typecheck
    if ($LASTEXITCODE -ne 0) { throw "TypeScript check failed" }

    if (-not $SkipTests) {
        npm run test
        if ($LASTEXITCODE -ne 0) { throw "Frontend tests failed" }
    }

    if (-not $SkipBackend) {
        & (Join-Path $PSScriptRoot "build-backend.ps1") -Python $Python
    }

    $BackendExe = Join-Path $Frontend "build\backend\AIStudyAssistantBackend.exe"
    if (-not (Test-Path $BackendExe)) {
        throw "Backend executable not found: $BackendExe"
    }

    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Renderer build failed" }

    npm run build:electron
    if ($LASTEXITCODE -ne 0) { throw "Electron build failed" }

    npx electron-builder --win --publish never
    if ($LASTEXITCODE -ne 0) { throw "NSIS installer build failed" }

    $Version = (Get-Content "package.json" -Raw | ConvertFrom-Json).version
    Write-Host "Installer written to frontend\dist\AI-Study-Assistant Setup $Version.exe"
} finally {
    popd
}
