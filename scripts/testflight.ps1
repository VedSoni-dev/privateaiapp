# Private AI -> TestFlight
# Run:  .\scripts\testflight.ps1

$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot\..

$Eas = Join-Path $PSScriptRoot "..\node_modules\.bin\eas.cmd"
if (-not (Test-Path $Eas)) {
    Write-Host "  Run: npm install" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "  Private AI -> TestFlight build + submit" -ForegroundColor Cyan
Write-Host ""

& $Eas build --platform ios --profile production --auto-submit
$exit = $LASTEXITCODE

if ($exit -ne 0) {
    Write-Host ""
    Write-Host "  FAILED (exit $exit). Check:" -ForegroundColor Red
    Write-Host "  https://expo.dev/accounts/vedonk/projects/private-ai/builds" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Write-Host ""
Write-Host "  SUCCESS - build uploaded to TestFlight." -ForegroundColor Green
Write-Host "  Wait 10-30 min, then refresh App Store Connect -> TestFlight." -ForegroundColor Gray
Write-Host "  Add testers: External Testing, add email." -ForegroundColor Gray
Write-Host ""
