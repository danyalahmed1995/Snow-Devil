$c = Get-Content -Path src\components\analytics\CIActivityPage.tsx -Raw
$c = $c -replace "import \{ getAnalyticsSyncState, isAnalyticsSyncActive \} from '../../analytics/sync';", "import { getAnalyticsSyncState, isAnalyticsSyncActive } from '../../analytics/sync';
import { matchesRepository } from '../../analytics/identity';"

$c = $c -replace "    const workflows = useMemo\(\(\) => \{[\s\S]*?    \}, \[allRuns, repositoryId\]\);", "    const getFilterRepo = () => repositoryId === 'all' ? null : reposForFilter.find(r => r.id === repositoryId);
    
    const workflows = useMemo(() => {
      const filterRepo = getFilterRepo();
      const runs = repositoryId === 'all' ? allRuns : allRuns.filter(r => matchesRepository((r.metadata as any)?.repositoryNumericId, r.repositoryName ?? r.repositoryId, filterRepo ? { id: filterRepo.id, fullName: filterRepo.nameWithOwner } : null, repositoryId));
      return Array.from(new Set(runs.map(r => r.subjectTitle))).sort();
    }, [allRuns, repositoryId, reposForFilter]);
  
    const branches = useMemo(() => {
      const filterRepo = getFilterRepo();
      const runs = repositoryId === 'all' ? allRuns : allRuns.filter(r => matchesRepository((r.metadata as any)?.repositoryNumericId, r.repositoryName ?? r.repositoryId, filterRepo ? { id: filterRepo.id, fullName: filterRepo.nameWithOwner } : null, repositoryId));
      return Array.from(new Set(runs.map(r => (r.metadata as any)?.headBranch).filter(Boolean))).sort();
    }, [allRuns, repositoryId, reposForFilter]);"

$c = $c -replace "      let passRepo = false;\n      if \(repositoryId !== "all" && run\.repositoryId !== repositoryId\) passRepo = false; else passRepo = true;\n      if \(isTarget\) console\.log\("Predicate \[repo\]:", passRepo, repositoryId, run\.repositoryId\);\n      if \(\!passRepo\) return false;\n      if \(repositoryId !== 'all' && run\.repositoryId !== repositoryId\) return false;", "      let passRepo = false;
      if (repositoryId === 'all') {
          passRepo = true;
      } else {
          const filterRepo = reposForFilter.find(r => r.id === repositoryId);
          passRepo = matchesRepository((run.metadata as any)?.repositoryNumericId, run.repositoryName ?? run.repositoryId, filterRepo ? { id: filterRepo.id, fullName: filterRepo.nameWithOwner } : null, repositoryId);
      }
      if (isTarget) console.log("Predicate [repo]:", passRepo, repositoryId, run.repositoryId);
      if (!passRepo) return false;"

Set-Content -Path src\components\analytics\CIActivityPage.tsx -Value $c
