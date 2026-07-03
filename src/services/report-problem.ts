import { invoke } from '@tauri-apps/api/core';

interface SafeDiagnostics {
  format: string;
  app: Record<string, unknown>;
  platform: Record<string, unknown>;
  database: Record<string, unknown>;
  privacy: Record<string, boolean>;
}

function redactedFrontendContext() {
  return {
    userAgent: navigator.userAgent.replace(/\([^)]*\)/g, '(redacted platform details)'),
    language: navigator.language,
    reducedMotion: document.documentElement.dataset.reducedMotion === 'true',
    canonicalTheme: document.documentElement.dataset.theme ?? 'snow-devil',
  };
}

/**
 * Build and download a "Report a problem" bundle: the existing privacy-safe
 * diagnostics plus the recent application-log tail (which captures panic traces
 * via the native panic hook). Nothing is sent anywhere — the user reviews the
 * downloaded file and attaches it to a support request, keeping the app's
 * local-first, no-silent-telemetry stance.
 */
export async function downloadProblemReport(): Promise<void> {
  const diagnostics = await invoke<SafeDiagnostics>('get_safe_diagnostics');

  let logs = '';
  try {
    logs = await invoke<string>('read_recent_log_tail');
  } catch {
    logs = '(recent logs unavailable)';
  }

  const generatedAt = new Date().toISOString();
  const bundle = {
    ...diagnostics,
    frontend: redactedFrontendContext(),
    generatedAt,
  };

  const report = [
    '# Snow Devil — problem report',
    '',
    `Generated: ${generatedAt}`,
    '',
    '> Please review this file before sharing. It contains anonymous diagnostics',
    '> and technical log lines — never tokens, cookies, repository names, API',
    '> payloads, or file contents — but you may still want to confirm its contents.',
    '',
    '## Diagnostics',
    '',
    '```json',
    JSON.stringify(bundle, null, 2),
    '```',
    '',
    '## Recent application logs',
    '',
    '```log',
    logs.trim() ? logs.trim() : '(no log entries recorded yet)',
    '```',
    '',
  ].join('\n');

  const blob = new Blob([report], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `snow-devil-report-${generatedAt.slice(0, 10)}.md`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
