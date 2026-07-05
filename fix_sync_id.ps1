$content = Get-Content -Path src\analytics\sync.ts -Raw
$content = $content -replace "function record\(account: string, repo: string, type: string, item: Record<string, unknown>\): RecordInput \{[\s\S]*?\}", "import { getCanonicalWorkflowRunId, getWorkflowRunTimestamp } from './identity';

function record(account: string, repo: string, type: string, item: Record<string, unknown>): RecordInput {
  let id = String(item.node_id ?? item.id ?? item.sha ?? item.ref ?? \`::\\`);
  let updated_at = String(item.updated_at ?? item.created_at ?? new Date().toISOString());

  if (type === 'workflow_run' && item.id) {
    const repoNumericId = (item.repository as any)?.id;
    id = getCanonicalWorkflowRunId(repoNumericId, repo, item.id as string | number);
    updated_at = getWorkflowRunTimestamp(item);
  }

  return { account_login: account, repository_id: repo, source_type: type, source_id: id, updated_at, payload_json: JSON.stringify(item) };
}"
Set-Content -Path src\analytics\sync.ts -Value $content
