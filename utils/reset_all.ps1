# Script para RESET TOTAL (Elimina base de datos, volúmenes y archivos subidos)

$ConfirmSelection = Read-Host "ATENCIÓN: Esto borrará TODA la base de datos y los archivos subidos. ¿Estás seguro? (S/N)"
if ($ConfirmSelection -ne "S") {
    Write-Host "Operación cancelada." -ForegroundColor Yellow
    exit
}

Write-Host "--- Deteniendo contenedores y eliminando VOLÚMENES (Base de Datos) ---" -ForegroundColor Red
docker-compose down -v

Write-Host "--- Limpiando archivos de audio subidos (/uploads) ---" -ForegroundColor Red
if (Test-Path "./uploads") {
    Get-ChildItem "./uploads" | Remove-Item -Recurse -Force
}

Write-Host "--- Reconstruyendo y levantando TODO el sistema desde cero ---" -ForegroundColor Cyan
docker-compose up -d --build

Write-Host "`n--- RESET COMPLETADO CON ÉXITO ---" -ForegroundColor Green
Write-Host "Base de datos: Vacía y con esquemas recreados."
Write-Host "Archivos: Directorio /uploads limpio."
Write-Host "URL: http://localhost:4200"
