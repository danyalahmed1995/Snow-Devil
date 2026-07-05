$c = Get-Content -Path src\components\analytics\CIActivityPage.tsx -Raw
$c = $c -replace '\} else if \(sync\.syncing && sync\.state\?\.currentJob\) \{[\s\S]*?\} else if', '} else if (sync.syncing && sync.state?.continuation_json) {
    const cont = JSON.parse(sync.state.continuation_json);
    if (cont.currentJob) freshnessText = "CI data updating \\u00B7 ${cont.currentJob.completedRepositories} of ${cont.currentJob.totalRepositories} repositories refreshed";
  } else if'
Set-Content -Path src\components\analytics\CIActivityPage.tsx -Value $c

$r = Get-Content -Path src\components\analytics\CIRunRow.tsx -Raw
$r = $r -replace 'import \{ useMemo \} from ''react'';\r?\n', ''
$r = $r -replace 'export function formatDurationHours[\s\S]*?\}', ''
$r = $r -replace '  const hasSparkline = sparklineRuns\.length > 0;\r?\n', ''
Set-Content -Path src\components\analytics\CIRunRow.tsx -Value $r
