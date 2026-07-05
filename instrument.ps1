$c = Get-Content -Path src\components\analytics\CIActivityPage.tsx -Raw
$c = $c -replace 'return allRuns\.filter\(run => \{', 'return allRuns.filter(run => {
      const isTarget = String((run.metadata as any)?.runId) === "28630872847";
      if (isTarget) {
        console.log("INSTRUMENT [28630872847]: START");
        console.log("ID:", run.id);
        console.log("Repository ID:", run.repositoryId);
        console.log("Repository Name:", run.repositoryName);
        console.log("Subject Type:", run.subjectType);
        console.log("Event Type:", run.eventType);
        console.log("Run ID:", (run.metadata as any)?.runId);
        console.log("Branch:", (run.metadata as any)?.headBranch);
        console.log("Status:", (run.metadata as any)?.status);
        console.log("Conclusion:", (run.metadata as any)?.conclusion);
        console.log("Occurred At:", run.occurredAt);
        console.log("Started At:", (run.metadata as any)?.startedAt);
        console.log("Completed At:", (run.metadata as any)?.completedAt);
        console.log("Selected Repo Filter:", repositoryId);
        console.log("Selected Range Choice:", rangeChoice);
      }
      
      let passRepo = false;
      if (repositoryId !== "all" && run.repositoryId !== repositoryId) passRepo = false; else passRepo = true;
      if (isTarget) console.log("Predicate [repo]:", passRepo, repositoryId, run.repositoryId);
      if (!passRepo) return false;'

$c = $c -replace '      if \(statusFilter !== ''all''\) \{', '      if (statusFilter !== ''all'') {
        if (isTarget) console.log("Predicate [statusFilter]: checking", statusFilter);'

$c = $c -replace '      if \(workflowFilter !== ''all'' && run\.subjectTitle !== workflowFilter\) return false;', '      let passWf = true; if (workflowFilter !== ''all'' && run.subjectTitle !== workflowFilter) passWf = false; if (isTarget) console.log("Predicate [wf]:", passWf); if (!passWf) return false;'
$c = $c -replace '      if \(branchFilter !== ''all'' && meta\?\.headBranch !== branchFilter\) return false;', '      let passBranch = true; if (branchFilter !== ''all'' && meta?.headBranch !== branchFilter) passBranch = false; if (isTarget) console.log("Predicate [branch]:", passBranch); if (!passBranch) return false;'
$c = $c -replace '      if \(eventFilter !== ''all'' && meta\?\.event !== eventFilter\) return false;', '      let passEvent = true; if (eventFilter !== ''all'' && meta?.event !== eventFilter) passEvent = false; if (isTarget) console.log("Predicate [event]:", passEvent); if (!passEvent) return false;'
$c = $c -replace '      if \(run\.occurredAt < cutoff\) return false;', '      let passRange = true; if (run.occurredAt < cutoff) passRange = false; if (isTarget) console.log("Predicate [range]:", passRange, run.occurredAt, cutoff); if (!passRange) return false;'

Set-Content -Path src\components\analytics\CIActivityPage.tsx -Value $c
