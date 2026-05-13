# Script para ejecutar los tests de Versiona

Write-Host "--- Ejecutando Tests del Backend ---" -ForegroundColor Cyan

# Asegurarse de estar en el directorio correcto
Push-Location "$PSScriptRoot\..\backend"

# Ejecutar pytest con el PYTHONPATH y DATABASE_URL configurados
if (Get-Command "pytest" -ErrorAction SilentlyContinue) {
    $env:PYTHONPATH = "."
    $env:DATABASE_URL = "sqlite:///:memory:"
    pytest
} else {
    Write-Host "Error: pytest no está instalado. Ejecuta 'pip install pytest httpx' primero." -ForegroundColor Red
}

Pop-Location

Write-Host "`n--- Ejecutando Tests del Frontend ---" -ForegroundColor Yellow

Push-Location "$PSScriptRoot\..\frontend"

# Ejecutar vitest
if (Get-Command "npm" -ErrorAction SilentlyContinue) {
    npx vitest run
} else {
    Write-Host "Error: npm no está instalado." -ForegroundColor Red
}

Pop-Location

Write-Host "`n--- Verificacion completa ---" -ForegroundColor Green
