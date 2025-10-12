\
Param(
  [int]$Port = 8765,
  [string]$Token = "devtoken",
  [switch]$AllowFirewall
)

Set-Location -Path (Split-Path -Parent $MyInvocation.MyCommand.Path) | Out-Null
Set-Location -Path ..\..

# Optional firewall rule
if ($AllowFirewall) {
  Write-Host "[i] Adding firewall rule for TCP $Port (current process)"
  Try {
    netsh advfirewall firewall add rule name="MCP TODO Server" dir=in action=allow protocol=TCP localport=$Port
  } Catch {
    Write-Host "[!] Failed to add firewall rule (try admin PowerShell)" -ForegroundColor Yellow
  }
}

$env:MCP_TOKEN = $Token
$env:PORT = $Port

Write-Host "[i] Starting MCP server on ws://0.0.0.0:$Port (token: $Token)"
Start-Process -FilePath "node" -ArgumentList "dist/server.js" -PassThru | Tee-Object -Variable p | Out-Null
$p.Id | Out-File ".server.pid" -Encoding ascii

# Show LAN URL candidates
Write-Host "[i] Possible LAN URLs:"
$ips = (Get-NetIPAddress -AddressFamily IPv4 -PrefixOrigin DHCP -ErrorAction SilentlyContinue |
        Where-Object {$_.IPAddress -notlike '169.254*'} |
        Select-Object -ExpandProperty IPAddress)
if (-not $ips) { $ips = @("127.0.0.1") }
$ips | ForEach-Object { Write-Host ("  - ws://{0}:{1}" -f $_, $Port) }
