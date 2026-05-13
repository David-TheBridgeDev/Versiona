# Script para refrescar y levantar los servicios de Backend y Frontend

Write-Host "--- Reconstruyendo y reiniciando servicios: API, Worker y Frontend ---" -ForegroundColor Yellow

# Reconstruir e iniciar los servicios específicos
# Incluimos 'worker' porque comparte código con 'api'
docker-compose up -d --build api worker frontend

Write-Host "`n--- Proceso completado con éxito ---" -ForegroundColor Green
Write-Host "API: http://localhost:8000"
Write-Host "Frontend: http://localhost:4200"
Write-Host "Documentación: http://localhost:8000/docs"
