$c = Get-Content -Path src\hooks\useAnalyticsSync.ts -Raw
$c = $c -replace 'await syncRepositoryCIRuns\(account, options.singleRepository, undefined\);', 'await syncRepositoryCIRuns(account, options.singleRepository!);'
Set-Content -Path src\hooks\useAnalyticsSync.ts -Value $c
