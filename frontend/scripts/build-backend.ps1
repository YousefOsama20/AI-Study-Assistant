<#
.SYNOPSIS
    Build and smoke-test the bundled Windows backend executable with PyInstaller.

.DESCRIPTION
    Creates an isolated Python 3.12 virtual environment under
    build\venv (unless -SkipInstall is supplied), installs the backend
    requirements plus PyInstaller, builds
    build\backend\AIStudyAssistantBackend.exe, and verifies that the frozen
    executable starts and serves the expected health responses.

    The executable is self-contained: end users do not need Python installed.

.PARAMETER Python
    Base Python interpreter used to create the virtual environment. Must be
    Python 3.12.

.PARAMETER VenvPath
    Virtual environment directory. Defaults to frontend\build\venv.

.PARAMETER SkipInstall
    Reuse the existing virtual environment without installing dependencies.

.PARAMETER SkipSmoke
    Skip launching the built executable. Not recommended.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts/build-backend.ps1
#>
param(
    [string]$Python = "python",
    [string]$VenvPath = "",
    [switch]$SkipInstall,
    [switch]$SkipSmoke
)

$ErrorActionPreference = "Stop"

$Frontend = Split-Path -Parent $PSScriptRoot
$Repo = Split-Path -Parent $Frontend
$Requirements = Join-Path $Repo "src\requirements.txt"
$Spec = Join-Path $PSScriptRoot "backend.spec"
$Dist = Join-Path $Frontend "build\backend"
$Work = Join-Path $Frontend "build\pyinstaller"
$PyInstallerVersion = "6.11.1"

if (-not $VenvPath) {
    $VenvPath = Join-Path $Frontend "build\venv"
}
if (-not (Test-Path $Requirements)) {
    throw "Requirements file not found: $Requirements"
}
if (-not (Test-Path $Spec)) {
    throw "PyInstaller spec not found: $Spec"
}

# --- Locate / create the isolated build environment -------------------------
$VenvPython = Join-Path $VenvPath "Scripts\python.exe"
if (-not (Test-Path $VenvPython)) {
    if ($SkipInstall) {
        throw "Virtual environment not found at $VenvPath and -SkipInstall was supplied."
    }
    Write-Host "Creating virtual environment at $VenvPath"
    & $Python -m venv $VenvPath
    if ($LASTEXITCODE -ne 0) { throw "Could not create the Python virtual environment." }
}

$Version = & $VenvPython -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}')"
if ($LASTEXITCODE -ne 0) { throw "Could not run the virtual environment Python." }
Write-Host "Using Python $Version from $VenvPython"
if (-not $Version.StartsWith("3.12.")) {
    throw "The backend build must use Python 3.12.x (found $Version). Pass -Python with a 3.12 interpreter."
}

if (-not $SkipInstall) {
    & $VenvPython -m pip install --upgrade pip
    if ($LASTEXITCODE -ne 0) { throw "pip upgrade failed." }
    & $VenvPython -m pip install -r $Requirements
    if ($LASTEXITCODE -ne 0) { throw "Backend dependency installation failed." }
    & $VenvPython -m pip install "pyinstaller==$PyInstallerVersion"
    if ($LASTEXITCODE -ne 0) { throw "PyInstaller installation failed." }
}

# --- Build -----------------------------------------------------------------
if (Test-Path $Dist) {
    Remove-Item -Recurse -Force $Dist
}
New-Item -ItemType Directory -Force -Path $Dist | Out-Null

Write-Host "Building backend executable with PyInstaller..."
& $VenvPython -m PyInstaller `
    --noconfirm `
    --clean `
    --distpath $Dist `
    --workpath $Work `
    $Spec
if ($LASTEXITCODE -ne 0) { throw "PyInstaller build failed." }

$Exe = Join-Path $Dist "AIStudyAssistantBackend.exe"
if (-not (Test-Path $Exe)) {
    throw "Expected backend executable was not created: $Exe"
}
$ExeSize = (Get-Item $Exe).Length
if ($ExeSize -lt 20MB) {
    throw "Backend executable is unexpectedly small ($([math]::Round($ExeSize / 1MB, 1)) MB)."
}
Write-Host ("Built {0} ({1:N1} MB)" -f $Exe, ($ExeSize / 1MB))

if (-not $SkipSmoke) {
    # --- Smoke test: run the frozen executable without a database ---------
    Write-Host "Smoke-testing the frozen backend..."

    $Token = [Guid]::NewGuid().ToString("N")
    $DataDir = Join-Path $env:TEMP ("aistudy-smoke-" + [Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

    $Listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $Listener.Start()
    $Port = ([System.Net.IPEndPoint]$Listener.LocalEndpoint).Port
    $Listener.Stop()

    $Saved = @{}
    foreach ($Name in @(
        "HOST", "PORT", "RELOAD", "AISTUDY_PACKAGED", "AISTUDY_AUTO_MIGRATE",
        "AISTUDY_DATA_DIR", "AISTUDY_API_TOKEN", "POSTGRES_HOST", "POSTGRES_PORT",
        "POSTGRES_USERNAME", "POSTGRES_PASSWORD", "POSTGRES_MAIN_DATABASE",
        "OPENAI_API_KEY", "COHERE_API_KEY", "GEMINI_API_KEY"
    )) {
        $Saved[$Name] = [Environment]::GetEnvironmentVariable($Name, "Process")
    }

    $Process = $null
    try {
        $env:HOST = "127.0.0.1"
        $env:PORT = "$Port"
        $env:RELOAD = "0"
        $env:AISTUDY_PACKAGED = "1"
        $env:AISTUDY_AUTO_MIGRATE = "0"
        $env:AISTUDY_DATA_DIR = $DataDir
        $env:AISTUDY_API_TOKEN = $Token
        $env:POSTGRES_HOST = "127.0.0.1"
        $env:POSTGRES_PORT = "1"
        $env:POSTGRES_USERNAME = "postgres"
        $env:POSTGRES_PASSWORD = ""
        $env:POSTGRES_MAIN_DATABASE = "ai_study_assistant"
        $env:OPENAI_API_KEY = ""
        $env:COHERE_API_KEY = ""
        $env:GEMINI_API_KEY = ""

        $Process = Start-Process -FilePath $Exe -PassThru -WindowStyle Hidden
        $Client = [System.Net.Http.HttpClient]::new()
        $Client.Timeout = [TimeSpan]::FromSeconds(5)
        $Base = "http://127.0.0.1:$Port"
        $Deadline = (Get-Date).AddSeconds(90)
        $Ready = $false

        while ((Get-Date) -lt $Deadline) {
            if ($Process.HasExited) {
                throw "Backend exited during startup with code $($Process.ExitCode)."
            }
            try {
                $Probe = $Client.GetAsync("$Base/api/v1/health").GetAwaiter().GetResult()
                if ([int]$Probe.StatusCode -eq 401) {
                    $Ready = $true
                    break
                }
            } catch {
                # Not listening yet.
            }
            Start-Sleep -Milliseconds 500
        }
        if (-not $Ready) {
            throw "Backend did not start within 90 seconds."
        }

        $Unauthorized = $Client.GetAsync("$Base/api/v1/health").GetAwaiter().GetResult()
        if ([int]$Unauthorized.StatusCode -ne 401) {
            throw "Expected 401 without a bearer token, got $([int]$Unauthorized.StatusCode)."
        }

        $Request = [System.Net.Http.HttpRequestMessage]::new(
            [System.Net.Http.HttpMethod]::Get, "$Base/api/v1/health"
        )
        $Request.Headers.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new("Bearer", $Token)
        $Authorized = $Client.SendAsync($Request).GetAwaiter().GetResult()
        $Body = $Authorized.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        if ([int]$Authorized.StatusCode -ne 503) {
            throw "Expected 503 from an unconfigured backend, got $([int]$Authorized.StatusCode): $Body"
        }
        $Json = $Body | ConvertFrom-Json
        if ($Json.status -ne "degraded") {
            throw "Expected degraded status, got '$($Json.status)'."
        }
        if ($Json.database.configured -ne $false) {
            throw "Smoke test expected an unconfigured database."
        }
        Write-Host "Smoke test passed: unauthenticated=401, authenticated=503 degraded."
    } finally {
        if ($Process -and -not $Process.HasExited) {
            Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
            $Process.WaitForExit(10000) | Out-Null
        }
        foreach ($Name in $Saved.Keys) {
            [Environment]::SetEnvironmentVariable($Name, $Saved[$Name], "Process")
        }
        Remove-Item -Recurse -Force $DataDir -ErrorAction SilentlyContinue
    }
}

# --- Checksums -------------------------------------------------------------
$Hash = (Get-FileHash -Algorithm SHA256 -Path $Exe).Hash.ToLowerInvariant()
$Line = "$Hash  AIStudyAssistantBackend.exe"
Set-Content -Path (Join-Path $Dist "SHA256SUMS.txt") -Value $Line -Encoding ASCII
Write-Host "SHA256 $Line"
Write-Host "Backend build complete: $Exe"
