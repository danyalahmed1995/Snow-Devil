(Get-Content -Path src/analytics/product-correctness.test.ts) -replace 'rawWorkflowRuns: \[\],', "$0 relationships: []," | Set-Content -Path src/analytics/product-correctness.test.ts
