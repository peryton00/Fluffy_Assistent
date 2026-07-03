# Fluffy Assistant - Python Brain Build Script
# Downloads Python 3.11 Embeddable, installs pip + all packages,
# and copies the brain/ source tree into installer/dist/

$ErrorActionPreference = "Stop"

$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$DistDir     = Join-Path $ScriptDir "dist"
$PythonDist  = Join-Path $DistDir "python"
$BrainDist   = Join-Path $DistDir "brain"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  [2/3] Building Python Brain (Embedded Python 3.11)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# ---- Step A: Download Python 3.11 Embeddable --------------------------------
$PythonVersion = "3.11.9"
$PythonUrl     = "https://www.python.org/ftp/python/$PythonVersion/python-$PythonVersion-embed-amd64.zip"
$PythonZip     = Join-Path $env:TEMP "python-embed.zip"

New-Item -ItemType Directory -Force -Path $PythonDist | Out-Null

if (Test-Path (Join-Path $PythonDist "python.exe")) {
    Write-Host "  INFO: Python Embeddable already extracted - skipping download." -ForegroundColor Magenta
} else {
    Write-Host "  Downloading Python $PythonVersion Embeddable..." -ForegroundColor Gray
    Write-Host "  URL: $PythonUrl" -ForegroundColor DarkGray
    try {
        Invoke-WebRequest -Uri $PythonUrl -OutFile $PythonZip -UseBasicParsing
        Write-Host "  OK: Downloaded." -ForegroundColor Green
    } catch {
        Write-Host "  FAIL: Download failed: $_" -ForegroundColor Red
        exit 1
    }

    Write-Host "  Extracting Python Embeddable to dist\python\..." -ForegroundColor Gray
    Expand-Archive -Path $PythonZip -DestinationPath $PythonDist -Force
    Remove-Item $PythonZip -Force
    Write-Host "  OK: Extracted." -ForegroundColor Green
}

# ---- Step B: Enable site-packages in Embeddable Python ----------------------
# The embedded Python has a python311._pth file that blocks importing site-packages.
# We must uncomment the 'import site' line to allow pip packages to be found.
$PthFile = Get-ChildItem -Path $PythonDist -Filter "python*._pth" | Select-Object -First 1
if ($PthFile) {
    Write-Host "  Enabling site-packages in $($PthFile.Name)..." -ForegroundColor Gray
    $Content = Get-Content $PthFile.FullName -Raw
    $Content = $Content -replace '#import site', 'import site'
    $Content = $Content -replace '^#\s*import site', 'import site'
    # Ensure Lib\site-packages path is present
    if ($Content -notmatch 'Lib\\site-packages') {
        $Content += "`nLib\site-packages`n"
    }
    # Add app root and brain dir to sys.path for embedded execution
    if ($Content -notmatch '\.\./brain') {
        $Content += "`n../brain`n../`n"
    }
    Set-Content -Path $PthFile.FullName -Value $Content
    Write-Host "  OK: site-packages and app paths enabled." -ForegroundColor Green
}

# ---- Step C: Bootstrap pip into Embeddable Python ---------------------------
$PythonExe   = Join-Path $PythonDist "python.exe"
$GetPipUrl   = "https://bootstrap.pypa.io/get-pip.py"
$GetPipFile  = Join-Path $env:TEMP "get-pip.py"
$LibDir      = Join-Path $PythonDist "Lib\site-packages"

New-Item -ItemType Directory -Force -Path $LibDir | Out-Null

if (Test-Path (Join-Path $LibDir "pip")) {
    Write-Host "  INFO: pip already installed - skipping." -ForegroundColor Magenta
} else {
    Write-Host "  Bootstrapping pip..." -ForegroundColor Gray
    Invoke-WebRequest -Uri $GetPipUrl -OutFile $GetPipFile -UseBasicParsing
    & $PythonExe $GetPipFile --no-warn-script-location --quiet
    Remove-Item $GetPipFile -Force
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  FAIL: pip bootstrap failed." -ForegroundColor Red
        exit 1
    }
    Write-Host "  OK: pip installed." -ForegroundColor Green
}

# ---- Step D: Install all brain requirements into Embedded Python ------------
$ReqFile = Join-Path $ProjectRoot "brain\requirements.txt"
if (-not (Test-Path $ReqFile)) {
    Write-Host "  FAIL: brain\requirements.txt not found!" -ForegroundColor Red
    exit 1
}

Write-Host "  Installing Python packages from brain\requirements.txt..." -ForegroundColor Gray
Write-Host "  (This may take 5-10 minutes depending on your connection)" -ForegroundColor DarkGray

$PipExe = Join-Path $PythonDist "Scripts\pip.exe"
if (-not (Test-Path $PipExe)) {
    # Fallback: use python -m pip
    & $PythonExe -m pip install `
        --target $LibDir `
        --no-warn-script-location `
        -r $ReqFile `
        --quiet
} else {
    & $PipExe install `
        --target $LibDir `
        --no-warn-script-location `
        -r $ReqFile `
        --quiet
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "  FAIL: Package installation failed." -ForegroundColor Red
    exit 1
}
Write-Host "  OK: All Python packages installed into embedded Python." -ForegroundColor Green

# ---- Step E: Copy the entire brain/ source tree -----------------------------
Write-Host "  Copying brain/ source to dist\brain\..." -ForegroundColor Gray

$BrainSrc = Join-Path $ProjectRoot "brain"
if (Test-Path $BrainDist) {
    Remove-Item $BrainDist -Recurse -Force
}

# Copy brain, excluding __pycache__ and .pyc files
robocopy $BrainSrc $BrainDist /E /XD "__pycache__" ".git" "backups" /XF "*.pyc" "*.pyo" /NFL /NDL /NJH /NJS | Out-Null

Write-Host "  OK: brain/ source copied to dist\brain\" -ForegroundColor Green

# ---- Step F: Copy voice/ directory (Piper TTS) ------------------------------
$VoiceSrc  = Join-Path $ProjectRoot "voice"
$VoiceDist = Join-Path $DistDir "voice"

if (Test-Path $VoiceSrc) {
    Write-Host "  Copying voice/ to dist\voice\..." -ForegroundColor Gray
    if (Test-Path $VoiceDist) { Remove-Item $VoiceDist -Recurse -Force }
    robocopy $VoiceSrc $VoiceDist /E /XD "__pycache__" /XF "*.pyc" /NFL /NDL /NJH /NJS | Out-Null
    Write-Host "  OK: voice/ copied." -ForegroundColor Green
}

# ---- Step G: Copy assets/ directory -----------------------------------------
$AssetsSrc  = Join-Path $ProjectRoot "assets"
$AssetsDist = Join-Path $DistDir "assets"

if (Test-Path $AssetsSrc) {
    Write-Host "  Copying assets/ to dist\assets\..." -ForegroundColor Gray
    if (Test-Path $AssetsDist) { Remove-Item $AssetsDist -Recurse -Force }
    robocopy $AssetsSrc $AssetsDist /E /NFL /NDL /NJH /NJS | Out-Null
    Write-Host "  OK: assets/ copied." -ForegroundColor Green
}

# Copy logo.png from Tauri public to dist/assets
$LogoSrc = Join-Path $ProjectRoot "ui\tauri\public\logo.png"
if (Test-Path $LogoSrc) {
    Copy-Item -Path $LogoSrc -Destination (Join-Path $AssetsDist "logo.png") -Force
    Write-Host "  OK: logo.png copied to dist\assets\" -ForegroundColor Green
}

# ---- Step H: Copy ai/ directory (LLM client) --------------------------------
$AiSrc  = Join-Path $ProjectRoot "ai"
$AiDist = Join-Path $DistDir "ai"

if (Test-Path $AiSrc) {
    Write-Host "  Copying ai/ to dist\ai\..." -ForegroundColor Gray
    if (Test-Path $AiDist) { Remove-Item $AiDist -Recurse -Force }
    robocopy $AiSrc $AiDist /E /XD "__pycache__" /XF "*.pyc" /NFL /NDL /NJH /NJS | Out-Null
    Write-Host "  OK: ai/ copied." -ForegroundColor Green
}

# ---- Step I: Copy services/ directory ---------------------------------------
$ServicesSrc  = Join-Path $ProjectRoot "services"
$ServicesDist = Join-Path $DistDir "services"

if (Test-Path $ServicesSrc) {
    Write-Host "  Copying services/ to dist\services\..." -ForegroundColor Gray
    if (Test-Path $ServicesDist) { Remove-Item $ServicesDist -Recurse -Force }
    robocopy $ServicesSrc $ServicesDist /E /XD "__pycache__" /XF "*.pyc" /NFL /NDL /NJH /NJS | Out-Null
    Write-Host "  OK: services/ copied." -ForegroundColor Green
}

# ---- Step J: Copy fluffy/ directory -----------------------------------------
$FluffySrc  = Join-Path $ProjectRoot "fluffy"
$FluffyDist = Join-Path $DistDir "fluffy"

if (Test-Path $FluffySrc) {
    Write-Host "  Copying fluffy/ to dist\fluffy\..." -ForegroundColor Gray
    if (Test-Path $FluffyDist) { Remove-Item $FluffyDist -Recurse -Force }
    robocopy $FluffySrc $FluffyDist /E /XD "__pycache__" /XF "*.pyc" /NFL /NDL /NJH /NJS | Out-Null
    Write-Host "  OK: fluffy/ copied." -ForegroundColor Green
}

Write-Host ""
Write-Host "  OK: Python Brain build complete!" -ForegroundColor Green
exit 0
