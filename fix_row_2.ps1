$r = Get-Content -Path src\components\analytics\CIRunRow.tsx -Raw
$r = $r -replace 'import \{ useMemo \} from ''react'';\r?\n', ''
$r = $r -replace 'export function formatDurationHours[\s\S]*?\}', ''
$r = $r -replace '  const hasSparkline = sparklineRuns\.length > 0;\r?\n', ''
$r = $r -replace 'import \{ memo, useMemo \} from ''react'';', 'import { memo } from ''react'';'
Set-Content -Path src\components\analytics\CIRunRow.tsx -Value $r
