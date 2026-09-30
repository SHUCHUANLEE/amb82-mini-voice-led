$ErrorActionPreference = "Stop"

$isAdministrator = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)

if (-not $isAdministrator) {
    $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList $arguments
    exit
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$pythonPath = Join-Path $env:LOCALAPPDATA "Programs\Python\Python312\python.exe"
$tailscalePath = "C:\Program Files\Tailscale\tailscale.exe"
$bridgePath = Join-Path $scriptRoot "bridge_server.py"
$pidPath = Join-Path $scriptRoot ".bridge.pid"
$stdoutPath = Join-Path $scriptRoot ".bridge.log"
$stderrPath = Join-Path $scriptRoot ".bridge-error.log"

if (-not (Test-Path -LiteralPath $pythonPath)) {
    throw "Python 3.12 was not found."
}
if (-not (Test-Path -LiteralPath $tailscalePath)) {
    throw "Tailscale was not found."
}

# 換電腦後 COM 編號可能改變，因此啟動時自動偵測，不固定使用 COM4。
$availablePorts = @([System.IO.Ports.SerialPort]::GetPortNames() | Sort-Object)
if ($availablePorts.Count -eq 0) {
    throw "No COM port was found. Connect the AMB82-MINI and try again."
}

if ($availablePorts.Count -eq 1) {
    $serialPort = $availablePorts[0]
} elseif ($availablePorts -contains "COM4") {
    $serialPort = "COM4"
} else {
    Write-Host "Available COM ports: $($availablePorts -join ', ')" -ForegroundColor Yellow
    $serialPort = Read-Host "Enter the AMB82-MINI COM port (example: COM5)"
    if ($availablePorts -notcontains $serialPort.ToUpperInvariant()) {
        throw "The selected COM port is not available."
    }
    $serialPort = $serialPort.ToUpperInvariant()
}

$bridgeRunning = $false
if (Test-Path -LiteralPath $pidPath) {
    $savedPid = Get-Content -LiteralPath $pidPath -ErrorAction SilentlyContinue
    if ($savedPid) {
        $bridgeRunning = $null -ne (Get-Process -Id ([int]$savedPid) -ErrorAction SilentlyContinue)
    }
}

if (-not $bridgeRunning) {
    $bridgeArguments = @(
        "-u",
        $bridgePath,
        "--serial-port", $serialPort,
        "--listen", "127.0.0.1",
        "--http-port", "8765"
    )
    $bridgeProcess = Start-Process -FilePath $pythonPath `
        -ArgumentList $bridgeArguments `
        -WindowStyle Hidden `
        -RedirectStandardOutput $stdoutPath `
        -RedirectStandardError $stderrPath `
        -PassThru
    Set-Content -LiteralPath $pidPath -Value $bridgeProcess.Id -Encoding ASCII
}

$ready = $false
for ($attempt = 0; $attempt -lt 20; $attempt++) {
    try {
        $response = Invoke-RestMethod -Uri "http://127.0.0.1:8765/api/status" -TimeoutSec 4
        if ($response.ok) {
            $ready = $true
            break
        }
    } catch {
        Start-Sleep -Milliseconds 500
    }
}

if (-not $ready) {
    throw "The bridge could not reach the AMB82-MINI. Close Serial Monitor and Web Serial, then try again."
}

& $tailscalePath serve --bg http://127.0.0.1:8765
if ($LASTEXITCODE -ne 0) {
    throw "Tailscale Serve could not start. Confirm that Tailscale is logged in."
}

Write-Host ""
Write-Host "DEMO READY" -ForegroundColor Green
Write-Host "AMB82-MINI serial port: $serialPort" -ForegroundColor Cyan
Write-Host "Open the HTTPS address shown below on the iPad:" -ForegroundColor Cyan
& $tailscalePath serve status
Write-Host ""
Write-Host "Keep Tailscale connected on both the PC and iPad."
Read-Host "Press Enter to close this window (the demo remains running)"
