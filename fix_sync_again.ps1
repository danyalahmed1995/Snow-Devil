$c = Get-Content -Path src\analytics\sync.ts -Raw
$c = $c -replace 'export function isCIRefreshInFlight\(repoName: string\)', 'export function isCIRefreshInFlight(account: string, repoName: string)'
$c = $c -replace 'export async function syncRepositoryCIRuns\(account: string, repo: string, invalidate: \(\) => void\)', 'export async function syncRepositoryCIRuns(account: string, repo: string, settings: any = null)'
$c = $c -replace '      invalidate\(\)\;', '      import("../main").then(m => m.queryClient.invalidateQueries({ queryKey: ["delivery-analytics"] }));'
Set-Content -Path src\analytics\sync.ts -Value $c
