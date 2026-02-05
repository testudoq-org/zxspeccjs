<#
Idempotent migration helper for test cleanup.
Usage (dry run):
  .\scripts\migrate-tests.ps1 -DryRun
Apply changes and update lint/configs:
  .\scripts\migrate-tests.ps1 -ApplyEdits

Behavior:
- Scans top-level .mjs files in repo root and classifies them into targets using patterns.
- Produces a move-plan JSON at .\move-plan.json for review.
- On confirmation (DryRun omitted or -ApplyEdits given), performs safe `git mv` operations and commits.
- Optionally updates package.json scripts and adds ESLint override for `tests/scripts/**`.
#>
param(
    [switch]$DryRun = $true,
    [switch]$ApplyEdits = $false
)

$root = (Get-Location).Path
Write-Host "Repository root: $root"

# Mapping patterns (ordered) -> destination
$mapping = @(
    @{ pat = '^test[_\-].*\.mjs$'; dest = 'tests/unit'; why='unit tests (fast, named test_)' },
    @{ pat = '^test.*\.mjs$'; dest = 'tests/unit'; why='test* patterns' },
    @{ pat = '^(boot|run_full_boot|run_boot).*\.mjs$'; dest = 'tests/e2e'; why='boot-style end-to-end tests' },
    @{ pat = 'comprehensive.*boot.*\.mjs$'; dest='tests/e2e'; why='comprehensive browser boot tests' },
    @{ pat = '.*(diagnostic|debug|analysis|examine|trace|report|final|corrected|detailed).*\.mjs$'; dest='tests/scripts'; why='diagnostic / debug / analysis scripts' }
)

# Find top-level .mjs files
$files = Get-ChildItem -File -Path $root -Filter *.mjs | Where-Object { $_.DirectoryName -eq $root }
Write-Host "Found $($files.Count) top-level .mjs files"

$plan = @()
foreach ($f in $files) {
    $name = $f.Name
    $matched = $false
    foreach ($m in $mapping) {
        if ($name -match $m.pat) {
            $destDir = Join-Path -Path $root -ChildPath $m.dest
            $destPath = Join-Path -Path $destDir -ChildPath $name
            $plan += [pscustomobject]@{ source = $f.FullName; name=$name; destDir=$m.dest; destPath=$destPath; reason=$m.why }
            $matched = $true
            break
        }
    }
    if (-not $matched) {
        # leave alone (explicitly: candidate for manual review)
        $plan += [pscustomobject]@{ source = $f.FullName; name=$name; destDir='(manual review)'; destPath=''; reason='no pattern matched' }
    }
}

$plan | Format-Table -AutoSize | Out-String | Write-Host

$planFile = Join-Path $root 'move-plan.json'
$plan | ConvertTo-Json -Depth 5 | Set-Content -Path $planFile -Encoding UTF8
Write-Host "Move plan written to $planFile"

if ($DryRun -and -not $ApplyEdits) {
    Write-Host "Dry run complete. To apply: run .\scripts\migrate-tests.ps1 -ApplyEdits"
    exit 0
}

# Apply moves
foreach ($entry in $plan) {
    if ($entry.destDir -eq '(manual review)') { continue }
    $destDirFull = Join-Path $root $entry.destDir
    if (-not (Test-Path $destDirFull)) { New-Item -ItemType Directory -Path $destDirFull | Out-Null; git add $destDirFull > $null 2>&1 }
    if (Test-Path $entry.source) {
        $relSrc = (Resolve-Path $entry.source).Path
        $relDest = Join-Path -Path $destDirFull -ChildPath $entry.name
        Write-Host "git mv '$relSrc' -> '$relDest'"
        & git mv "$relSrc" "$relDest"
    }
}

# Commit the move
& git commit -m "chore(tests): migrate top-level diagnostic/test files per migration plan" || Write-Host 'No changes to commit.'

# Optionally update package.json scripts and ESLint override
if ($ApplyEdits) {
    Write-Host "Applying package.json and ESLint edits..."
    $pkgPath = Join-Path $root 'package.json'
    $pkg = Get-Content $pkgPath | ConvertFrom-Json

    # update scripts
    $pkg.scripts.'test:unit' = 'vitest run --dir tests/unit'
    $pkg.scripts.'test:integration' = 'vitest run --dir tests/integration'
    $pkg.scripts.'test:e2e' = 'npx playwright test tests/e2e'
    $pkg.scripts.'test:all' = 'npm run test:unit && npm run test:integration && npm run test:e2e'
    $pkg.scripts.'test:watch' = 'vitest --watch --dir tests/unit'

    $pkg | ConvertTo-Json -Depth 10 | Set-Content -Path $pkgPath -Encoding UTF8
    & git add $pkgPath

    # eslint update: add override for tests/scripts/**
    $eslintrcPath = Join-Path $root '.eslintrc.cjs'
    $eslintrc = Get-Content $eslintrcPath -Raw
    if ($eslintrc -notmatch "tests/scripts") {
        $insert = @'
    ,
    {
      files: ['tests/scripts/**/*.mjs'],
      env: { node: true, browser: true, es2021: true },
      rules: {
        'no-console': 'off',
        'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        'no-undef': 'off'
      }
    }
'@
        $eslintrc = $eslintrc -replace "\]\s*\}\s*;", "`r`n$insert`r`n  ]\n};"
        $eslintrc | Set-Content -Path $eslintrcPath -Encoding UTF8
        & git add $eslintrcPath
    }

    & git commit -m "chore(lint): add ESLint override for tests/scripts and update test scripts" || Write-Host 'No changes to commit.'
}

Write-Host "Migration complete. Review move-plan.json and the commit(s)."