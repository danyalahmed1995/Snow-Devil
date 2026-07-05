$c = Get-Content -Path src\analytics\sync.ts -Raw
$c = $c -replace 'export function isCIRefreshInFlight\(account: string, repoName: string\)', 'export function isCIRefreshInFlight(_account: string, repoName: string)'
$c = $c -replace 'export async function syncRepositoryCIRuns\(account: string, repo: string, settings: any = null\)', 'export async function syncRepositoryCIRuns(account: string, repo: string, _settings: any = null)'
$c = $c -replace 'import\("../main"\)\.then\(m => m\.queryClient\.invalidateQueries\(\{ queryKey: \["delivery-analytics"\] \}\)\)\;', 'import("../app/providers").then(m => m.queryClient.invalidateQueries({ queryKey: ["delivery-analytics"] })).catch(() => {});'
Set-Content -Path src\analytics\sync.ts -Value $c

$c = Get-Content -Path src\hooks\useAnalyticsSync.ts -Raw
$c = $c -replace 'isCIRefreshInFlight\(account, repo\)', 'isCIRefreshInFlight(account, repo)'
Set-Content -Path src\hooks\useAnalyticsSync.ts -Value $c

$c = Get-Content -Path src\hooks\useAnalyticsData.ts -Raw
$c = $c -replace 'import \{ getCanonicalWorkflowRunId, getWorkflowRunTimestamp, normalizeRepositoryName \} from ''\.\./analytics/identity''\;', 'import { getCanonicalWorkflowRunId, getWorkflowRunTimestamp } from ''../analytics/identity'';'
Set-Content -Path src\hooks\useAnalyticsData.ts -Value $c

