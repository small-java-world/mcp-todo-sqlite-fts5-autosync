\
Param()

# Ensure script runs where the repo is
Set-Location -Path (Split-Path -Parent $MyInvocation.MyCommand.Path) | Out-Null
Set-Location -Path ..\..

# Check Node
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "[!] Node.js not found. Install Node.js and re-run." -ForegroundColor Yellow
  exit 1
}

# Pick package manager
$pkg = "pnpm"
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) { $pkg = "npm" }

Write-Host "[i] Installing dependencies with $pkg ..."
if ($pkg -eq "pnpm") {
  pnpm i
} else {
  npm i
}

Write-Host "[i] Building TypeScript ..."
if ($pkg -eq "pnpm") {
  pnpm run build
} else {
  npx tsc -p tsconfig.json
}

Write-Host "[i] Setup done. Use scripts\\win\\start.ps1 to launch the server."
