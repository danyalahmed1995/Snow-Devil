$c = Get-Content -Path src\analytics\sync.ts -Raw
$c = $c -replace 'export function isCIRefreshInFlight\(_account: string, repoName: string\)', 'export function isCIRefreshInFlight(repoName: string)'
Set-Content -Path src\analytics\sync.ts -Value $c
