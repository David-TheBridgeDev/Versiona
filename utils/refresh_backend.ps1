# Script para refrescar solamente el BACKEND (API + Worker)

Write-Host "--- Reconstruyendo y reiniciando: API y WORKER ---" -ForegroundColor Magenta

# Reiniciamos ambos porque comparten el código de la carpeta /backend
docker-compose up -d --build api worker

Write-Host "`n--- Backend actualizado ---" -ForegroundColor Green
Write-Host "API: http://localhost:8000"
Write-Host "Swagger: http://localhost:8000/docs"
