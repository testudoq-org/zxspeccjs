# Prepend file-level ESLint disables to tests/scripts files that don't already have one
$files = Get-ChildItem -Path tests\scripts -Filter *.mjs -Recurse
$changed = $false
foreach ($f in $files) {
    $text = Get-Content $f.FullName -Raw
    if ($text -notmatch 'eslint-disable') {
        $header = "/* eslint-disable no-console, no-undef, no-unused-vars */`r`n"
        Set-Content -Path $f.FullName -Value ($header + $text)
        Write-Host "Updated: $($f.FullName)"
        $changed = $true
    }
}
if ($changed) {
    & git add tests\scripts
    $res = & git commit -m "chore(lint): add file-level eslint disables to diagnostic scripts"
    if ($LASTEXITCODE -ne 0) { Write-Host 'No changes to commit.' }
} else {
    Write-Host 'No files required modification.'
}