# PowerShell script to install dependencies and start dev server
# Usage: .\run-dev.ps1

Write-Output "Installing npm dependencies..."
npm install

if ($LASTEXITCODE -ne 0) {
  Write-Error "npm install failed with exit code $LASTEXITCODE"
  exit $LASTEXITCODE
}

Write-Output "Starting dev server (npm run dev)..."
Start-Process -NoNewWindow -FilePath "npm" -ArgumentList "run","dev"
Write-Output "Dev server started. Open http://localhost:8080 in your browser."