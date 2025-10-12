\
Param()

Set-Location -Path (Split-Path -Parent $MyInvocation.MyCommand.Path) | Out-Null
Set-Location -Path ..\..

$usePnpm = Get-Command pnpm -ErrorAction SilentlyContinue
if ($usePnpm) {
  pnpm i
  pnpm run build
  pnpm run test:unit
} else {
  npm i
  npm run build
  npm run test:unit
}
