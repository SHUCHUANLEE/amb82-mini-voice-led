$ErrorActionPreference = 'Stop'
$webDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $webDirectory

Write-Host 'Ameba Mini voice control page:'
Write-Host 'http://localhost:8000'
Write-Host 'Press Ctrl+C to stop the server.'

& py -m http.server 8000 --bind 127.0.0.1
