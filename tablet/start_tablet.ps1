$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$pythonPath = Join-Path $env:LOCALAPPDATA "Programs\Python\Python312\python.exe"

if (-not (Test-Path -LiteralPath $pythonPath)) {
    throw "Python 3.12 was not found."
}

# 換電腦後 COM 編號可能改變，因此啟動時自動偵測。
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

& $pythonPath (Join-Path $scriptRoot "bridge_server.py") --serial-port $serialPort --http-port 8765
