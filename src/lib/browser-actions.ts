import { openUrl } from '@tauri-apps/plugin-opener';

export function safeExternalUrl(value?: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'github.com' || url.hostname.endsWith('.github.com')) ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function openInDefaultBrowser(value?: string): Promise<void> {
  const url = safeExternalUrl(value);
  if (!url) throw new Error('A valid GitHub URL is unavailable.');
  try {
    await openUrl(url);
  } catch {
    if (typeof window !== 'undefined' && typeof window.open === 'function') {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    throw new Error('The default browser could not be opened.');
  }
}

export async function copyCanonicalLink(value?: string): Promise<void> {
  const url = safeExternalUrl(value);
  if (!url) throw new Error('A valid GitHub URL is unavailable.');
  await navigator.clipboard.writeText(url);
}
