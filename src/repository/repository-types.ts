export type RepositoryEntryType = 'tree' | 'blob';

export interface RepositoryEntry {
  name: string;
  path: string;
  type: RepositoryEntryType;
}

export interface RepositoryBranch { name: string; kind: 'branch' | 'tag'; isDefault?: boolean; oid?: string }
export interface RepositoryFile { text: string | null; byteSize: number; path: string; contentBase64?: string; mimeType?: string }

export type FilePreviewKind = 'text' | 'markdown' | 'image' | 'binary' | 'large';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']);
const BINARY_EXTENSIONS = new Set(['zip', 'gz', '7z', 'pdf', 'exe', 'dll', 'wasm', 'woff', 'woff2', 'ttf']);

export function normalizeTree(entries: RepositoryEntry[]): RepositoryEntry[] {
  return [...entries].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'tree' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

export function treeCacheKey(repository: string, ref: string, path = '') {
  return `${repository}@${ref}:${path}`;
}

export function classifyFile(path: string, byteSize: number, text: string | null): FilePreviewKind {
  const extension = path.split('.').pop()?.toLowerCase() ?? '';
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (byteSize > 1_000_000) return 'large';
  if (BINARY_EXTENSIONS.has(extension) || text === null) return 'binary';
  if (extension === 'md' || extension === 'mdx') return 'markdown';
  return 'text';
}

export function languageForPath(path: string) {
  const extension = path.split('.').pop()?.toLowerCase() ?? '';
  return ({ ts: 'TypeScript', tsx: 'TSX', js: 'JavaScript', jsx: 'JSX', rs: 'Rust', css: 'CSS', json: 'JSON', md: 'Markdown', yml: 'YAML', yaml: 'YAML', toml: 'TOML', html: 'HTML' } as Record<string, string>)[extension] ?? 'Plain text';
}
