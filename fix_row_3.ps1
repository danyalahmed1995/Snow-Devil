$r = Get-Content -Path src\components\analytics\CIRunRow.tsx -Raw
$r = $r -replace 'import \{ useState, useMemo \} from ''react'';', 'import { useState } from ''react'';'
$r = $r -replace 'import \{ formatDurationHours \} from ''\.\./\.\./analytics/math'';\r?\n', ''
$r = $r -replace 'export function CIRunRow\(\{ run, isSelected, sparklineRuns, onSelect \}: \{ run: SimulatorEvent; isSelected: boolean; sparklineRuns: number\[\]; onSelect: \(id: string\) => void \}\)', 'export function CIRunRow({ run, isSelected, onSelect }: { run: SimulatorEvent; isSelected: boolean; sparklineRuns?: number[]; onSelect: (id: string) => void })'
Set-Content -Path src\components\analytics\CIRunRow.tsx -Value $r
