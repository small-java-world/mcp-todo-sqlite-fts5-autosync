\
Param()

Set-Location -Path (Split-Path -Parent $MyInvocation.MyCommand.Path) | Out-Null
Set-Location -Path ..\..

if (Test-Path ".server.pid") {
  $pid = Get-Content ".server.pid" -ErrorAction SilentlyContinue
  if ($pid) {
    Write-Host "[i] Stopping server (PID: $pid)"
    try { Stop-Process -Id $pid -Force -ErrorAction Stop } catch {}
    Remove-Item ".server.pid" -Force -ErrorAction SilentlyContinue
    exit 0
  }
}
Write-Host "[i] No running server found"
