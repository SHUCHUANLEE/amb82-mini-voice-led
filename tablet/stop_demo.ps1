$ErrorActionPreference = "SilentlyContinue"

$isAdministrator = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)

if (-not $isAdministrator) {
    $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList $arguments
    exit
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$tailscalePath = "C:\Program Files\Tailscale\tailscale.exe"
$pidPath = Join-Path $scriptRoot ".bridge.pid"

if (Test-Path -LiteralPath $tailscalePath) {
    & $tailscalePath serve reset
}

if (Test-Path -LiteralPath $pidPath) {
    $savedPid = Get-Content -LiteralPath $pidPath
    if ($savedPid) {
        Stop-Process -Id ([int]$savedPid) -Force
    }
    Remove-Item -LiteralPath $pidPath -Force
}

Write-Host "Demo services stopped."
Start-Sleep -Seconds 2
