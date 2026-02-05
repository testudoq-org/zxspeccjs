# Prepend file-level ESLint header + console binding to tests files that use console and are missing a header
$files = Get-ChildItem -Path tests -Filter *.mjs -Recurse
$changedFiles = @()
foreach ($f in $files) {
    $text = Get-Content $f.FullName -Raw
    if ($text -match 'console' -and $text -notmatch 'eslint-disable' -and $text -notmatch "eslint-env") {
        $header = "/* eslint-disable no-console, no-undef, no-unused-vars */`r`n/* eslint-env node, browser */`r`nconst console = globalThis.console;`r`n`r`n"
        Set-Content -Path $f.FullName -Value ($header + $text)
        Write-Host "Updated: $($f.FullName)"
        $changedFiles += $f.FullName
    }
}
if ($changedFiles.Count -gt 0) {
    git add $changedFiles
    git commit -m "chore(lint): add missing eslint headers to tests files"
    Write-Host "Committed $($changedFiles.Count) files"
} else {
    Write-Host 'No test files required modification.'
}
Write-Output $changedFiles