# Script para refrescar solamente el FRONTEND

Write-Host "--- Reconstruyendo y reiniciando: FRONTEND ---" -ForegroundColor Cyan

docker-compose up -d --build frontend

Write-Host "`n--- Frontend actualizado ---" -ForegroundColor Green
Write-Host "URL: http://localhost:4200"
