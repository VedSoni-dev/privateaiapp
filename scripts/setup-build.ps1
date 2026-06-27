# Private AI — EAS build setup (run from project root)
# Usage: .\scripts\setup-build.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

Write-Host "`n=== Private AI: EAS Setup ===`n" -ForegroundColor Cyan

Write-Host "[1/4] Installing npm dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n[2/4] Checking Expo login..." -ForegroundColor Yellow
npx eas whoami
if ($LASTEXITCODE -ne 0) {
    Write-Host "`nNot logged in. Run: npx eas login" -ForegroundColor Red
    Write-Host "Then re-run this script.`n"
    exit 1
}

Write-Host "`n[3/4] Linking EAS project..." -ForegroundColor Yellow
npx eas init --non-interactive --force
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n[4/4] Ready to build!" -ForegroundColor Green
Write-Host @"

Next steps:
  1. Register your iPhone:  npx eas device:create
  2. Build for iOS:       npm run build:ios

During the build, sign in with YOUR Apple ID (on Martin's team).
Choose 'Let EAS handle credentials' when asked.

"@
