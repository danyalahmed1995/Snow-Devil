$c = Get-Content -Path src\components\analytics\CIActivityPage.tsx -Raw
$c = $c -replace "import \{ getAnalyticsSyncState, isAnalyticsSyncActive \} from '../../analytics/sync';", "import { isAnalyticsSyncActive } from '../../analytics/sync';"
Set-Content -Path src\components\analytics\CIActivityPage.tsx -Value $c
