# PowerShell script to kill all Node.js processes and free up ports 3000-3002
Write-Host "Stopping all Node.js processes and freeing ports..." -ForegroundColor Yellow

# Get all Node.js processes
$nodeProcesses = Get-Process | Where-Object { $_.ProcessName -eq "node" }

if ($nodeProcesses.Count -eq 0) {
    Write-Host "No Node.js processes found." -ForegroundColor Green
} else {
    Write-Host "Found $($nodeProcesses.Count) Node.js process(es):" -ForegroundColor Cyan
    foreach ($proc in $nodeProcesses) {
        Write-Host "  PID: $($proc.Id) - $($proc.Path)" -ForegroundColor Yellow
    }

    # Kill all Node.js processes
    Write-Host "Terminating Node.js processes..." -ForegroundColor Red
    $nodeProcesses | Stop-Process -Force
    Write-Host "All Node.js processes terminated." -ForegroundColor Green
}

# Check for processes using ports 8080, 8081, 8082 (based on package.json scripts)
$ports = @("8080", "8081", "8082")
foreach ($port in $ports) {
    $connections = Get-NetTCPConnection | Where-Object { $_.LocalPort -eq [int]$port -and $_.State -eq "Listen" }
    if ($connections) {
        Write-Host "Found process(es) listening on port ${port}:" -ForegroundColor Yellow
        foreach ($conn in $connections) {
            $process = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
            if ($process) {
                Write-Host "  PID: $($process.Id) - $($process.Name) - $($process.Path)" -ForegroundColor Yellow
                Write-Host "  Terminating process..." -ForegroundColor Red
                Stop-Process -Id $conn.OwningProcess -Force
                Write-Host "  Terminating process..." -ForegroundColor Red
                Stop-Process -Id $conn.OwningProcess -Force
            }
        }
        Write-Host "Port $port freed." -ForegroundColor Green
    } else {
        Write-Host "Port $port is free." -ForegroundColor Green
    }
}

Write-Host "Cleanup complete." -ForegroundColor Green