import { invoke } from '@tauri-apps/api/core';

interface SafeDiagnostics { format:string; app:Record<string,unknown>; platform:Record<string,unknown>; database:Record<string,unknown>; privacy:Record<string,boolean> }

export async function exportSafeDiagnostics(): Promise<void> {
  const backend = await invoke<SafeDiagnostics>('get_safe_diagnostics');
  const bundle = {
    ...backend,
    frontend: {
      userAgent: navigator.userAgent.replace(/\([^)]*\)/g, '(redacted platform details)'),
      language: navigator.language,
      reducedMotion: document.documentElement.dataset.reducedMotion === 'true',
      canonicalTheme: document.documentElement.dataset.theme ?? 'snow-devil',
    },
    generatedAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `snow-devil-diagnostics-${new Date().toISOString().slice(0,10)}.json`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
