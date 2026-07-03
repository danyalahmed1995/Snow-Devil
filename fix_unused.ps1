(Get-Content -Path src/components/analytics/CIActivityPage.tsx) -replace 'Loader2, ', '' | Set-Content -Path src/components/analytics/CIActivityPage.tsx
(Get-Content -Path src/components/analytics/CIActivityPage.tsx) -replace 'SimulatorEvent, ', '' | Set-Content -Path src/components/analytics/CIActivityPage.tsx
(Get-Content -Path src/components/analytics/CIRunRow.tsx) -replace 'useMemo, ', '' | Set-Content -Path src/components/analytics/CIRunRow.tsx
(Get-Content -Path src/components/analytics/CIRunRow.tsx) -replace 'GitPullRequest, ', '' | Set-Content -Path src/components/analytics/CIRunRow.tsx
(Get-Content -Path src/components/analytics/CIRunRow.tsx) -replace 'Search, ', '' | Set-Content -Path src/components/analytics/CIRunRow.tsx
(Get-Content -Path src/components/analytics/CIRunRow.tsx) -replace 'import \{ formatDurationHours \} from ''../../lib/time-utils'';', '' | Set-Content -Path src/components/analytics/CIRunRow.tsx
(Get-Content -Path src/components/diff/CommitDiff.tsx) -replace 'ChevronDown, ', '' -replace 'Eye, ', '' -replace 'EyeOff, ', '' -replace 'FileImage, ', '' | Set-Content -Path src/components/diff/CommitDiff.tsx
(Get-Content -Path src/components/diff/PullRequestDiff.tsx) -replace 'ChevronDown, ', '' -replace 'Eye, ', '' -replace 'EyeOff, ', '' -replace 'FileImage, ', '' -replace 'GitCompare, ', '' | Set-Content -Path src/components/diff/PullRequestDiff.tsx
(Get-Content -Path src/components/diff/DiffShared.tsx) -replace 'Check, ', '' | Set-Content -Path src/components/diff/DiffShared.tsx
