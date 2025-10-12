\
Param(
  [string]$Token = "testtoken"
)

Set-Location -Path (Split-Path -Parent $MyInvocation.MyCommand.Path) | Out-Null
Set-Location -Path ..\..

$env:MCP_TOKEN = $Token

$usePnpm = Get-Command pnpm -ErrorAction SilentlyContinue
if ($usePnpm) {
  pnpm i
  pnpm run build
  pnpm run test:integration
} else {
  npm i
  npm run build
  npm run test:integration
}
