# Script to refresh ONLY the BACKEND (API + Worker)

Write-Host "--- Rebuilding and restarting: API and WORKER ---" -ForegroundColor Magenta

# We restart both because they share the code from the /backend folder
docker-compose up -d --build api worker

Write-Host "`n--- Backend updated ---" -ForegroundColor Green
Write-Host "API: http://localhost:8000"
Write-Host "Swagger: http://localhost:8000/docs"
