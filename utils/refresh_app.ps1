# Script to refresh and start Backend and Frontend services

Write-Host "--- Rebuilding and restarting services: API, Worker and Frontend ---" -ForegroundColor Yellow

# Rebuild and start specific services
# We include 'worker' because it shares code with 'api'
docker-compose up -d --build api worker frontend

Write-Host "`n--- Process completed successfully ---" -ForegroundColor Green
Write-Host "API: http://localhost:8000"
Write-Host "Frontend: http://localhost:4200"
Write-Host "Documentation: http://localhost:8000/docs"
