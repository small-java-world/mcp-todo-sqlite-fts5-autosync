\
Param()

Set-Location -Path (Split-Path -Parent $MyInvocation.MyCommand.Path) | Out-Null
Set-Location -Path ..\..

if (Test-Path ".server.pid") {
  $pid = Get-Content ".server.pid" -ErrorAction SilentlyContinue
  if ($pid) {
    try {
      $p = Get-Process -Id $pid -ErrorAction Stop
      Write-Host "[i] Server running (PID: $pid)"
      exit 0
    } catch {
      # not running
    }
  }
}
Write-Host "[i] Server NOT running"
exit 1
