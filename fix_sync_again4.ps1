$c = Get-Content -Path src\hooks\useAnalyticsSync.ts -Raw
$c = $c -replace 'await startAnalyticsSync\(account, settings, options\);', 'await startAnalyticsSync(account, settings);'
Set-Content -Path src\hooks\useAnalyticsSync.ts -Value $c
