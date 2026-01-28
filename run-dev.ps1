# PowerShell script to install dependencies and start dev server
# Usage: .\run-dev.ps1

Write-Output "Installing npm dependencies..."
npm install --legacy-peer-deps

if ($LASTEXITCODE -ne 0) {
  Write-Error "npm install failed with exit code $LASTEXITCODE"
  exit $LASTEXITCODE
}

Write-Output "Starting dev server (npm run dev)..."
Write-Output "Server will be available at http://localhost:8080"
Write-Output "Press Ctrl+C to stop the server."
Write-Output ""

# Run npm directly (not via Start-Process) so it works properly
npm run dev