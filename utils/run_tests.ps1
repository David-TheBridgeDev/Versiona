# Script to run Versiona tests

Write-Host "--- Running Backend Tests ---" -ForegroundColor Cyan

# Ensure we are in the correct directory
Push-Location "$PSScriptRoot\..\backend"

# Run pytest with configured PYTHONPATH and DATABASE_URL
if (Get-Command "pytest" -ErrorAction SilentlyContinue) {
    $env:PYTHONPATH = "."
    $env:DATABASE_URL = "sqlite:///:memory:"
    pytest
} else {
    Write-Host "Error: pytest is not installed. Run 'pip install pytest httpx' first." -ForegroundColor Red
}

Pop-Location

Write-Host "`n--- Running Frontend Tests ---" -ForegroundColor Yellow

Push-Location "$PSScriptRoot\..\frontend"

# Run vitest
if (Get-Command "npm" -ErrorAction SilentlyContinue) {
    npx vitest run
} else {
    Write-Host "Error: npm is not installed." -ForegroundColor Red
}

Pop-Location

Write-Host "`n--- Verification complete ---" -ForegroundColor Green
