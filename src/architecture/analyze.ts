import type { ArchitectureComponent, ArchitectureConfidence, ArchitectureDecisionContext, ArchitectureDependencyChange, ArchitectureDiffFile, ArchitectureEvidence, ArchitectureRisk, ArchitectureRiskReason, ArchitectureSnapshot, ChangedFileArchitectureMapping, PullRequestArchitectureImpact } from './types';
import { ARCHITECTURE_ALGORITHM_VERSION } from './feature';
import { analyzeComponentDecisions } from './decision-analysis';

const EXCLUDED = ['node_modules/', 'vendor/', 'dist/', 'build/', 'target/', 'coverage/', '.next/', 'out/', 'bin/', 'obj/', 'generated/'];
const COMPONENT_DIRS = new Set(['apps', 'packages', 'libs', 'services', 'modules', 'crates']);

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'root';
}

function title(value: string): string {
  return value.split(/[-_]/).filter(Boolean).map(part => part[0]?.toUpperCase() + part.slice(1)).join(' ');
}

function componentBoundary(path: string): { key: string; name: string; root: string; kind: ArchitectureComponent['kind']; confidence: ArchitectureConfidence; evidence: ArchitectureEvidence } | undefined {
  const normalized = path.replace(/\\/g, '/').replace(/^\//, '');
  if (!normalized || EXCLUDED.some(prefix => normalized === prefix.slice(0, -1) || normalized.startsWith(prefix))) return undefined;
  const parts = normalized.split('/');
  const first = parts[0];
  if (COMPONENT_DIRS.has(first) && parts[1]) return { key: `${first}/${parts[1]}`, name: title(parts[1]), root: `${first}/${parts[1]}`, kind: first === 'apps' ? 'application' : first === 'services' ? 'service' : first === 'crates' ? 'package' : 'library', confidence: { level: 'medium', score: .78 }, evidence: { type: 'directory', source: `${first}/`, detail: `Matched the conventional ${first}/ component boundary.` } };
  if (first === 'src-tauri') return { key: first, name: 'Desktop Runtime', root: first, kind: 'runtime', confidence: { level: 'high', score: .9 }, evidence: { type: 'manifest-boundary', source: 'src-tauri/Cargo.toml', detail: 'Matched the Tauri Rust package boundary.' } };
  if (first === '.github' || first === '.snowdevil' || ['Dockerfile', 'docker-compose.yml'].includes(first)) return { key: 'infrastructure', name: 'Delivery Infrastructure', root: first.includes('.') ? first : '.', kind: 'infrastructure', confidence: { level: 'medium', score: .76 }, evidence: { type: 'directory', source: first, detail: 'Matched repository delivery and configuration paths.' } };
  if (first === 'tests' || first === 'e2e' || first === '__tests__') return { key: first, name: first === 'e2e' ? 'End-to-End Tests' : 'Test Suite', root: first, kind: 'tests', confidence: { level: 'medium', score: .74 }, evidence: { type: 'test-location', source: `${first}/`, detail: 'Matched a repository test boundary.' } };
  if (first === 'docs' || /^(README|CONTRIBUTING|CHANGELOG)/i.test(first)) return { key: 'documentation', name: 'Documentation', root: first === 'docs' ? 'docs' : '.', kind: 'documentation', confidence: { level: 'medium', score: .72 }, evidence: { type: 'directory', source: first, detail: 'Matched documentation paths.' } };
  if (first === 'src' && parts[1]) {
    const group = parts[1] === 'components' && parts[2] ? parts[2] : parts[1];
    const shared = ['lib', 'types', 'styles', 'stores', 'hooks', 'services'].includes(group);
    return { key: `src/${group}`, name: shared ? title(group === 'lib' ? 'Shared Runtime' : group) : title(group), root: parts[1] === 'components' ? `src/components/${group}` : `src/${group}`, kind: shared ? 'shared' : group === 'app' ? 'application' : 'package', confidence: { level: 'low', score: .62 }, evidence: { type: 'directory', source: `src/${group}`, detail: 'Inferred from the nearest source directory; no repository manifest or explicit configuration was available.' } };
  }
  if (['package.json', 'pnpm-workspace.yaml', 'Cargo.toml', 'go.mod', 'pyproject.toml'].includes(first)) return { key: 'repository-root', name: 'Repository Root', root: '.', kind: 'application', confidence: { level: 'high', score: .86 }, evidence: { type: 'manifest-boundary', source: first, detail: 'Matched a repository-root manifest.' } };
  return undefined;
}

export function stableComponentId(repositoryId: string, key: string): string {
  return `${slug(repositoryId)}:${slug(key)}`;
}

function mapFile(repositoryId: string, file: ArchitectureDiffFile, snapshot?: ArchitectureSnapshot): ChangedFileArchitectureMapping {
  const path = file.status === 'deleted' ? file.oldPath : file.newPath;
  const indexed = snapshot?.files.find(mapping => mapping.path === path) ?? (file.status === 'renamed' ? snapshot?.files.find(mapping => mapping.path === file.oldPath) : undefined);
  if (indexed) return { ...indexed, path, previousPath: file.status === 'renamed' ? file.oldPath : undefined, status: file.status === 'deleted' ? 'removed' : file.status, additions: file.additions, deletions: file.deletions };
  const boundary = componentBoundary(path);
  return { path, previousPath: file.status === 'renamed' ? file.oldPath : undefined, componentId: boundary ? stableComponentId(repositoryId, boundary.key) : undefined, confidence: boundary?.confidence ?? { level: 'unknown', score: 0 }, reasons: boundary ? [boundary.evidence] : [], status: file.status === 'deleted' ? 'removed' : file.status, additions: file.additions, deletions: file.deletions };
}

function componentFor(repositoryId: string, file: ChangedFileArchitectureMapping): ArchitectureComponent | undefined {
  const boundary = componentBoundary(file.path);
  if (!boundary || !file.componentId) return undefined;
  return { id: file.componentId, repositoryId, name: boundary.name, kind: boundary.kind, rootPaths: [boundary.root], manifestPaths: boundary.evidence.type === 'manifest-boundary' ? [boundary.evidence.source] : [], configured: false, owners: [], confidence: boundary.confidence };
}

function importTarget(text: string): string | undefined {
  const match = text.match(/(?:from\s+|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]/);
  return match?.[1];
}

function resolveRelative(source: string, target: string): string {
  const parts = source.split('/'); parts.pop();
  for (const part of target.split('/')) { if (part === '..') parts.pop(); else if (part !== '.') parts.push(part); }
  return parts.join('/').replace(/\.(tsx?|jsx?|rs|py)$/, '');
}

function dependencyChanges(repositoryId: string, files: ArchitectureDiffFile[], mappings: ChangedFileArchitectureMapping[], snapshot?: ArchitectureSnapshot): ArchitectureDependencyChange[] {
  const result = new Map<string, ArchitectureDependencyChange>();
  files.forEach((file, index) => {
    const from = mappings[index]?.componentId;
    if (!from) return;
    for (const line of file.lines) {
      if (line.type !== 'add' && line.type !== 'remove') continue;
      const include = line.text.match(/^\s*#\s*include\s*"([^"]+)"/)?.[1];
      const target = include ?? importTarget(line.text);
      if (!target || !include && !target.startsWith('.')) continue;
      const targetPath = resolveRelative(file.status === 'deleted' ? file.oldPath : file.newPath, target);
      const indexedTarget = snapshot?.files.find(mapping => mapping.path === targetPath || mapping.path.startsWith(`${targetPath}.`) || mapping.path.endsWith(`/${target}`));
      if (indexedTarget?.componentId && indexedTarget.componentId !== from) {
        const change = line.type === 'add' ? 'new' : 'removed';
        const kind = include ? 'include' as const : 'import' as const;
        const key = `${change}:${from}:${indexedTarget.componentId}:${kind}`;
        result.set(key, { fromComponentId: from, toComponentId: indexedTarget.componentId, kind, change, confidence: { level: 'high', score: .9 }, evidence: [{ type: include ? 'include' : 'import', source: file.newPath, detail: `${line.type === 'add' ? 'Added' : 'Removed'} ${include ? 'local include' : 'import'} ${target}, resolved to ${indexedTarget.path}.` }] });
        continue;
      }
      const boundary = componentBoundary(targetPath);
      if (!boundary) continue;
      const to = stableComponentId(repositoryId, boundary.key);
      if (to === from) continue;
      const change = line.type === 'add' ? 'new' : 'removed';
      const key = `${change}:${from}:${to}`;
      result.set(key, { fromComponentId: from, toComponentId: to, kind: 'import', change, confidence: { level: 'medium', score: .8 }, evidence: [{ type: 'import', source: file.newPath, detail: `${line.type === 'add' ? 'Added' : 'Removed'} import ${target}.` }] });
    }
  });
  const changedPaths = new Set(files.flatMap(file => [file.oldPath, file.newPath]));
  for (const edge of snapshot?.dependencies ?? []) {
    const touchedEvidence = edge.evidence.filter(evidence => changedPaths.has(evidence.source));
    if (!touchedEvidence.length) continue;
    const key = `existing-touched:${edge.fromComponentId}:${edge.toComponentId}:${edge.kind}`;
    if (!result.has(key)) result.set(key, { ...edge, change: 'existing-touched', evidence: touchedEvidence });
  }
  return [...result.values()];
}

function calculateRisk(mappings: ChangedFileArchitectureMapping[], dependencyCount: number, snapshot?: ArchitectureSnapshot): ArchitectureRisk {
  const reasons: ArchitectureRiskReason[] = [];
  const componentCount = new Set(mappings.flatMap(file => file.componentId ? [file.componentId] : [])).size;
  const paths = mappings.map(file => file.path.toLowerCase());
  if (componentCount > 1) reasons.push({ code: 'cross-component', label: 'Cross-component change', detail: `Changes cross ${componentCount} inferred component boundaries.`, weight: Math.min(24, componentCount * 6) });
  if (dependencyCount) reasons.push({ code: 'dependency-change', label: 'Dependency boundary changed', detail: `${dependencyCount} cross-component import ${dependencyCount === 1 ? 'change has' : 'changes have'} direct file evidence.`, weight: Math.min(28, dependencyCount * 14) });
  if (paths.some(path => /(^|\/)(migrations?|schema|db)(\/|\.|$)/.test(path))) reasons.push({ code: 'persistence', label: 'Persistence boundary touched', detail: 'A database, schema, or migration path changed.', weight: 22 });
  if (paths.some(path => /(^|\/)(auth|permission|security)(\/|\.|$)/.test(path))) reasons.push({ code: 'security', label: 'Authentication or permission path touched', detail: 'Review authorization and permission behavior carefully.', weight: 26 });
  if (paths.some(path => path.startsWith('.github/workflows/') || /docker|deploy|release/.test(path))) reasons.push({ code: 'delivery', label: 'Delivery configuration changed', detail: 'Workflow, deployment, or release behavior may be affected.', weight: 18 });
  const changedComponents = new Set(mappings.flatMap(file => file.componentId ? [file.componentId] : []));
  if (changedComponents.size && [...changedComponents].every(id => snapshot?.components.find(component => component.id === id)?.kind === 'tests')) reasons.push({ code: 'test-only', label: 'Test-only component change', detail: 'Mapped changes are confined to test components; production impact is limited unless new dependency evidence crosses the boundary.', weight: 4 });
  const broadHeader = mappings.find(file => /\.(h|hh|hpp|hxx)$/.test(file.path) && file.componentId && (snapshot?.dependencies.filter(edge => edge.toComponentId === file.componentId).length ?? 0) >= 3);
  if (broadHeader) reasons.push({ code: 'broad-header', label: 'Widely depended-on header changed', detail: `${broadHeader.path} belongs to a component with several direct dependents.`, weight: 22 });
  const unmapped = mappings.filter(file => !file.componentId).length;
  if (unmapped) reasons.push({ code: 'unmapped', label: 'Unmapped files', detail: `${unmapped} changed ${unmapped === 1 ? 'file is' : 'files are'} outside recognized boundaries.`, weight: Math.min(18, 6 + unmapped * 3) });
  if (!reasons.length) reasons.push({ code: 'bounded-change', label: 'Bounded component change', detail: 'The change remains inside one recognizable component and no sensitive boundary was detected.', weight: 12 });
  const score = Math.min(100, reasons.reduce((sum, reason) => sum + reason.weight, 0));
  return { score, level: score >= 80 ? 'critical' : score >= 55 ? 'high' : score >= 25 ? 'medium' : 'low', reasons };
}

export function analyzePullRequestArchitecture(input: { repositoryId: string; pullRequestNumber: number; baseSha?: string; headSha?: string; files: ArchitectureDiffFile[]; generatedAt?: string; snapshot?: ArchitectureSnapshot; decisionContext?: ArchitectureDecisionContext }): PullRequestArchitectureImpact {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const mappings = input.files.map(file => mapFile(input.repositoryId, file, input.snapshot));
  const components = new Map<string, ArchitectureComponent>((input.snapshot?.components ?? []).map(component => [component.id, component]));
  for (const mapping of mappings) { const component = componentFor(input.repositoryId, mapping); if (component) components.set(component.id, component); }
  const grouped = new Map<string, ChangedFileArchitectureMapping[]>();
  for (const mapping of mappings) if (mapping.componentId) grouped.set(mapping.componentId, [...(grouped.get(mapping.componentId) ?? []), mapping]);
  const ranked = [...grouped.entries()].sort((a, b) => {
    const weight = (files: ChangedFileArchitectureMapping[]) => files.reduce((sum, file) => sum + file.additions + file.deletions + 20, 0);
    return weight(b[1]) - weight(a[1]) || a[0].localeCompare(b[0]);
  });
  const primaryComponentId = ranked[0]?.[0];
  const affectedComponents = ranked.map(([id, files]) => ({ component: components.get(id)!, files, additions: files.reduce((sum, file) => sum + file.additions, 0), deletions: files.reduce((sum, file) => sum + file.deletions, 0), role: id === primaryComponentId ? 'primary' as const : 'secondary' as const }));
  const changes = dependencyChanges(input.repositoryId, input.files, mappings, input.snapshot);
  for (const change of changes) {
    if (!components.has(change.toComponentId)) {
      const targetFile = input.files.find(file => change.evidence[0]?.source === file.newPath);
      const importText = targetFile?.lines.map(line => importTarget(line.text)).find(target => {
        if (!target || !targetFile || !target.startsWith('.')) return false;
        const targetBoundary = componentBoundary(resolveRelative(targetFile.newPath, target));
        return targetBoundary && stableComponentId(input.repositoryId, targetBoundary.key) === change.toComponentId;
      });
      const boundary = importText && targetFile ? componentBoundary(resolveRelative(targetFile.newPath, importText)) : undefined;
      if (boundary) components.set(change.toComponentId, { id: change.toComponentId, repositoryId: input.repositoryId, name: boundary.name, kind: boundary.kind, rootPaths: [boundary.root], manifestPaths: [], configured: false, owners: [], confidence: boundary.confidence });
    }
  }
  const changedIds = new Set(grouped.keys());
  const graph = input.snapshot?.dependencies ?? [];
  const direct = new Set([...changedIds, ...changes.flatMap(change => [change.fromComponentId, change.toComponentId])]);
  for (const edge of graph) if (changedIds.has(edge.fromComponentId)) direct.add(edge.toComponentId); else if (changedIds.has(edge.toComponentId)) direct.add(edge.fromComponentId);
  const indirect = new Set<string>();
  for (const edge of graph) {
    if (direct.has(edge.fromComponentId) && !direct.has(edge.toComponentId)) indirect.add(edge.toComponentId);
    if (direct.has(edge.toComponentId) && !direct.has(edge.fromComponentId)) indirect.add(edge.fromComponentId);
  }
  const completeness = input.snapshot?.status === 'ready' ? 1 : input.snapshot ? .78 : .6;
  const score = mappings.length ? Math.round(mappings.reduce((sum, item) => sum + item.confidence.score, 0) / mappings.length * completeness * 100) / 100 : 0;
  const confidence: ArchitectureConfidence = { score, level: score >= .85 ? 'high' : score >= .65 ? 'medium' : score > 0 ? 'low' : 'unknown' };
  const baseSha = input.baseSha || 'base-unavailable';
  const snapshotComponents = [...components.values()];
  const unmappedFiles = mappings.filter(file => !file.componentId).map(file => file.path);
  const snapshot: ArchitectureSnapshot = input.snapshot ?? {
    repositoryId: input.repositoryId,
    baseCommitSha: baseSha,
    generatedAt,
    algorithmVersion: ARCHITECTURE_ALGORITHM_VERSION,
    status: 'partial' as const,
    components: snapshotComponents,
    dependencies: changes.map(change => ({ fromComponentId: change.fromComponentId, toComponentId: change.toComponentId, kind: change.kind, confidence: change.confidence, evidence: change.evidence })),
    files: mappings.map(mapping => ({ path: mapping.path, componentId: mapping.componentId, confidence: mapping.confidence, reasons: mapping.reasons })),
    unmappedFiles,
    excludedPaths: [],
    warnings: [{ code: 'unsupported-layout', message: 'The full repository index was unavailable; only changed-file evidence was analyzed.' }],
    evidenceSummary: { mappedFiles: mappings.length - unmappedFiles.length, totalFiles: mappings.length, configured: false, manifestCount: 0, dependencyEvidenceCount: changes.length, ownedFiles: 0, requestCount: 0, exclusions: EXCLUDED },
  };
  const result: PullRequestArchitectureImpact = { repositoryId: input.repositoryId, pullRequestNumber: input.pullRequestNumber, baseSha, headSha: input.headSha || 'head-unavailable', architectureSnapshotSha: snapshot.baseCommitSha, primaryComponentId, affectedComponents, changedFileMappings: mappings, dependencyChanges: changes, directBlastRadius: [...direct], indirectBlastRadius: [...indirect], risk: calculateRisk(mappings, changes.length, snapshot), confidence, unmappedFiles, generatedAt, snapshot, decisionContext: input.decisionContext };
  result.decisionAnalysis = analyzeComponentDecisions(result);
  return result;
}
