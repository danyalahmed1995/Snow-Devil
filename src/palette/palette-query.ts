export type PaletteFilterKey = 'repo' | 'type' | 'author' | 'is';
export interface ParsedPaletteQuery { text: string; filters: Partial<Record<PaletteFilterKey, string[]>>; unknown: string[] }

const KEYS = new Set<PaletteFilterKey>(['repo', 'type', 'author', 'is']);

export function parsePaletteQuery(input: string): ParsedPaletteQuery {
  const filters: ParsedPaletteQuery['filters'] = {};
  const text: string[] = [];
  const unknown: string[] = [];
  for (const token of input.trim().split(/\s+/).filter(Boolean)) {
    const match = /^([a-z]+):(.+)$/i.exec(token);
    const key = match?.[1].toLowerCase() as PaletteFilterKey | undefined;
    if (key && KEYS.has(key) && match?.[2]) (filters[key] ??= []).push(match[2].toLowerCase());
    else { text.push(token); if (match) unknown.push(token); }
  }
  return { text: text.join(' '), filters, unknown };
}

export interface RankableResult { id: string; type: string; title: string; subtitle?: string; repository?: string; state?: string; author?: string; source?: 'local' | 'remote' }

export function rankResults<T extends RankableResult>(results: T[], input: string): T[] {
  const query = parsePaletteQuery(input);
  const needle = query.text.toLowerCase();
  const unique = new Map<string, T>();
  for (const result of results) {
    if (query.filters.type?.length && !query.filters.type.some(type => type === result.type || (type === 'repo' && result.type === 'repository'))) continue;
    if (query.filters.repo?.length && !query.filters.repo.some(repo => (result.repository ?? result.title).toLowerCase().includes(repo))) continue;
    if (query.filters.author?.length && !query.filters.author.includes((result.author ?? '').toLowerCase())) continue;
    if (query.filters.is?.length && !query.filters.is.includes((result.state ?? '').toLowerCase())) continue;
    const haystack = `${result.title} ${result.subtitle ?? ''} ${result.repository ?? ''}`.toLowerCase();
    if (needle && !fuzzyIncludes(haystack, needle)) continue;
    const existing = unique.get(result.id);
    if (!existing || (existing.source === 'remote' && result.source !== 'remote')) unique.set(result.id, result);
  }
  return [...unique.values()].sort((a, b) => score(b, needle) - score(a, needle) || a.title.localeCompare(b.title));
}

function fuzzyIncludes(value: string, query: string) {
  if (value.includes(query)) return true;
  let cursor = 0;
  for (const character of value) if (character === query[cursor]) cursor++;
  return cursor === query.length;
}

function score(result: RankableResult, needle: string) {
  if (!needle) return result.source === 'local' ? 10 : 0;
  const title = result.title.toLowerCase();
  if (title === needle) return 100;
  if (title.startsWith(needle)) return 80;
  if (title.includes(needle)) return 60;
  return 20;
}
