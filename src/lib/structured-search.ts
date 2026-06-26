export interface SearchToken {
  key?: string;
  value: string;
  raw: string;
}

const TOKEN_PATTERN = /(?:([a-z][\w-]*):)?(?:"([^"]+)"|(\S+))/gi;

export function parseStructuredSearch(query: string): SearchToken[] {
  const tokens: SearchToken[] = [];
  for (const match of query.matchAll(TOKEN_PATTERN)) {
    tokens.push({ key: match[1]?.toLowerCase(), value: (match[2] ?? match[3] ?? '').toLowerCase(), raw: match[0] });
  }
  return tokens;
}

export interface SearchableWorkItem {
  title?: string;
  repository?: string;
  number?: number;
  author?: string;
  labels?: string[];
  stage?: string;
  state?: string;
  isDraft?: boolean;
  checks?: string;
  review?: string;
  type?: string;
  reason?: string;
  confidence?: string;
  related?: string[];
  ageDays?: number;
  branch?: string;
  sha?: string;
}

function matchesToken(item: SearchableWorkItem, token: SearchToken): boolean {
  const value = token.value;
  if (!token.key) {
    if (/^#\d+$/.test(value)) return item.number === Number(value.slice(1));
    return `${item.title ?? ''} ${item.repository ?? ''} ${item.number ?? ''}`.toLowerCase().includes(value);
  }
  switch (token.key) {
    case 'repo': return (item.repository ?? '').toLowerCase().includes(value);
    case 'author': return (item.author ?? '').toLowerCase().includes(value);
    case 'label': return (item.labels ?? []).some(label => label.toLowerCase().includes(value));
    case 'title': return (item.title ?? '').toLowerCase().includes(value);
    case 'stage': return (item.stage ?? '').toLowerCase() === value;
    case 'checks': return (item.checks ?? '').toLowerCase().includes(value);
    case 'review': return (item.review ?? '').toLowerCase().includes(value);
    case 'type': return (item.type ?? '').toLowerCase().includes(value);
    case 'reason': return (item.reason ?? '').toLowerCase().includes(value);
    case 'confidence': return (item.confidence ?? '').toLowerCase() === value;
    case 'related': return value === 'none' ? !(item.related?.length) : (item.related ?? []).some(related => related.toLowerCase().includes(value));
    case 'branch': return (item.branch ?? '').toLowerCase().includes(value);
    case 'sha': return (item.sha ?? '').toLowerCase().startsWith(value);
    case 'is':
      if (value === 'draft') return Boolean(item.isDraft);
      return (item.state ?? '').toLowerCase() === value;
    case 'age': {
      const match = value.match(/^(>=|<=|>|<|=)?(\d+(?:\.\d+)?)d$/);
      if (!match || item.ageDays == null) return false;
      const expected = Number(match[2]);
      return match[1] === '>' ? item.ageDays > expected : match[1] === '>=' ? item.ageDays >= expected : match[1] === '<' ? item.ageDays < expected : match[1] === '<=' ? item.ageDays <= expected : item.ageDays === expected;
    }
    default: return `${item.title ?? ''} ${item.repository ?? ''} ${item.number ?? ''}`.toLowerCase().includes(token.raw.toLowerCase());
  }
}

export function matchesStructuredSearch(item: SearchableWorkItem, query: string): boolean {
  return parseStructuredSearch(query).every(token => matchesToken(item, token));
}
