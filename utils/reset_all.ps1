# Script for TOTAL RESET (Deletes database, volumes, and uploaded files)

$ConfirmSelection = Read-Host "ATTENTION: This will delete the ENTIRE database and uploaded files. Are you sure? (Y/N)"
if ($ConfirmSelection -ne "Y") {
    Write-Host "Operation cancelled." -ForegroundColor Yellow
    exit
}

Write-Host "--- Stopping containers and removing VOLUMES (Database) ---" -ForegroundColor Red
docker-compose down -v

Write-Host "--- Cleaning uploaded audio files (/uploads) ---" -ForegroundColor Red
if (Test-Path "./uploads") {
    Get-ChildItem "./uploads" | Remove-Item -Recurse -Force
}

Write-Host "--- Rebuilding and starting the ENTIRE system from scratch ---" -ForegroundColor Cyan
docker-compose up -d --build

Write-Host "`n--- RESET COMPLETED SUCCESSFULLY ---" -ForegroundColor Green
Write-Host "Database: Empty with recreated schemas."
Write-Host "Files: /uploads directory cleaned."
Write-Host "URL: http://localhost:4200"
