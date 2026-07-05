$content = Get-Content -Path src\components\analytics\CIRunRow.tsx -Raw
$content = $content -replace 'import \{ useMemo \} from ''react'';\r?\n', ''
$content = $content -replace 'export function formatDurationHours\(.*?\r?\n\}', ''
$content = $content -replace '  const hasSparkline = sparklineRuns\.length > 0;\r?\n', ''
Set-Content -Path src\components\analytics\CIRunRow.tsx -Value $content
