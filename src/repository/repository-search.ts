export interface RepositorySearchSyntax {
  text: string;
  exactPhrase?: string;
  path?: string;
  filename?: string;
  extension?: string;
  folder?: string;
}

export interface RepositorySearchResult {
  path: string;
  name: string;
  htmlUrl?: string;
  score?: number;
  repository?: string;
}

export type RepositorySearchErrorKind = 'rate-limit' | 'authentication' | 'not-found' | 'network' | 'unavailable';
export function classifyRepositorySearchError(cause: unknown): RepositorySearchErrorKind {
  const message = String(cause).toLowerCase();
  if (message.includes('rate limit') || message.includes('secondary rate') || message.includes('status 429') || message.includes('status 403')) return 'rate-limit';
  if (message.includes('401') || message.includes('unauthorized') || message.includes('credential') || message.includes('token') && message.includes('expired')) return 'authentication';
  if (message.includes('404') || message.includes('not found') || message.includes('inaccessible')) return 'not-found';
  if (message.includes('network') || message.includes('offline') || message.includes('connection')) return 'network';
  return 'unavailable';
}

const qualifier = /\b(path|filename|ext|folder):(?:"([^"]+)"|(\S+))/gi;

export function parseRepositorySearch(value: string): RepositorySearchSyntax {
  const result: RepositorySearchSyntax = { text: '' };
  let remaining = value;
  for (const match of value.matchAll(qualifier)) {
    const key = match[1].toLowerCase();
    const token = (match[2] ?? match[3] ?? '').trim();
    if (key === 'ext') result.extension = token.replace(/^\./, '');
    else result[key as 'path'|'filename'|'folder'] = token;
    remaining = remaining.replace(match[0], ' ');
  }
  const phrase = remaining.match(/"([^"]+)"/);
  if (phrase) {
    result.exactPhrase = phrase[1];
    remaining = remaining.replace(phrase[0], ' ');
  }
  result.text = remaining.trim().replace(/\s+/g, ' ');
  return result;
}

export function toGitHubCodeQuery(value: string, repository: string): string {
  const parsed = parseRepositorySearch(value);
  const terms = [parsed.exactPhrase ? `"${parsed.exactPhrase}"` : parsed.text, `repo:${repository}`];
  if (parsed.path) terms.push(`path:${parsed.path}`);
  if (parsed.folder) terms.push(`path:${parsed.folder}`);
  if (parsed.filename) terms.push(`filename:${parsed.filename}`);
  if (parsed.extension) terms.push(`extension:${parsed.extension}`);
  return terms.filter(Boolean).join(' ');
}

export function matchesRepositorySearch(path: string, value: string): boolean {
  const parsed = parseRepositorySearch(value);
  const lower = path.toLowerCase();
  const name = path.split('/').pop()?.toLowerCase() ?? '';
  if (parsed.path && !lower.includes(parsed.path.toLowerCase())) return false;
  if (parsed.folder && !lower.startsWith(`${parsed.folder.toLowerCase().replace(/\/$/, '')}/`)) return false;
  if (parsed.filename && !name.includes(parsed.filename.toLowerCase())) return false;
  if (parsed.extension && !name.endsWith(`.${parsed.extension.toLowerCase()}`)) return false;
  const needle = (parsed.exactPhrase ?? parsed.text).toLowerCase();
  return !needle || lower.includes(needle);
}
