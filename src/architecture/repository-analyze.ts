import { ARCHITECTURE_ALGORITHM_VERSION } from './feature';
import { stableComponentId } from './analyze';
import type { ArchitectureComponent, ArchitectureComponentKind, ArchitectureConfidence, ArchitectureEvidence, ArchitectureOwner, ArchitectureSnapshot, ArchitectureWarning, ComponentDependency, RepositoryArchitectureInput } from './types';

const MANIFEST_NAMES = new Set(['package.json', 'pnpm-workspace.yaml', 'Cargo.toml', 'pyproject.toml', 'setup.py', 'setup.cfg', 'go.mod', 'go.work', 'pom.xml', 'settings.gradle', 'settings.gradle.kts', 'build.gradle', 'build.gradle.kts', 'CMakeLists.txt', 'Makefile', 'meson.build', 'BUILD', 'BUILD.bazel']);
const CODEOWNERS_PATHS = ['.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS'];
const SOURCE_EXTENSIONS = new Set(['ts', 'tsx', 'js', 'jsx', 'rs', 'py', 'go', 'java', 'kt', 'kts', 'c', 'cc', 'cpp', 'cxx', 'h', 'hh', 'hpp', 'hxx']);

interface ConfigComponent { id: string; name: string; kind?: ArchitectureComponentKind; paths: string[] }
interface ParsedConfig { components: ConfigComponent[]; dependencies: Array<{ from: string; to: string }>; criticalPaths: string[]; warnings: ArchitectureWarning[] }
interface Candidate { component: ArchitectureComponent; roots: string[]; configuredPatterns?: string[]; evidence: ArchitectureEvidence }

function parent(path: string): string { const index = path.lastIndexOf('/'); return index < 0 ? '.' : path.slice(0, index) || '.'; }
function base(path: string): string { return path.split('/').pop() ?? path; }
function title(value: string): string { return value.split(/[-_.]/).filter(Boolean).map(part => part[0]?.toUpperCase() + part.slice(1)).join(' '); }
function normalizedRoot(root: string): string { return root === '' ? '.' : root.replace(/^\.\//, '').replace(/\/$/, '') || '.'; }
function pathWithin(path: string, root: string): boolean { return root === '.' || path === root || path.startsWith(`${root}/`); }
function level(score: number): ArchitectureConfidence['level'] { return score >= .85 ? 'high' : score >= .65 ? 'medium' : score > 0 ? 'low' : 'unknown'; }
function confidence(score: number): ArchitectureConfidence { return { score, level: level(score) }; }

function globRegex(pattern: string): RegExp {
  const normalized = pattern.replace(/^\//, '');
  let value = '^';
  for (let index = 0; index < normalized.length; index++) {
    const char = normalized[index];
    if (char === '*' && normalized[index + 1] === '*') { value += '.*'; index++; }
    else if (char === '*') value += '[^/]*';
    else if (char === '?') value += '[^/]';
    else value += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`${value}${normalized.endsWith('/') ? '.*' : '$'}`);
}

function matchesGlob(path: string, pattern: string): boolean {
  try { return globRegex(pattern).test(path); } catch { return false; }
}

function parseConfig(value: unknown): ParsedConfig {
  const warnings: ArchitectureWarning[] = [];
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  if (!record) return { components: [], dependencies: [], criticalPaths: [], warnings };
  if (record.version !== 1) warnings.push({ code: 'invalid-config', message: 'Architecture configuration must declare version: 1.' });
  const components: ConfigComponent[] = [];
  const ids = new Set<string>();
  for (const [index, raw] of (Array.isArray(record.components) ? record.components : []).entries()) {
    const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const paths = Array.isArray(item.paths) ? item.paths.filter((path): path is string => typeof path === 'string' && path.trim().length > 0) : [];
    if (!id || !name || !paths.length || ids.has(id)) { warnings.push({ code: 'invalid-config', message: `Configured component ${index + 1} needs a unique id, name, and at least one path.` }); continue; }
    ids.add(id);
    const allowedKinds = new Set<ArchitectureComponentKind>(['application','service','package','library','runtime','infrastructure','shared','tests','documentation','unknown']);
    const kind = typeof item.kind === 'string' && allowedKinds.has(item.kind as ArchitectureComponentKind) ? item.kind as ArchitectureComponentKind : 'unknown';
    if (typeof item.kind === 'string' && kind === 'unknown' && item.kind !== 'unknown') warnings.push({ code: 'invalid-config', message: `Configured component ${id} has unsupported kind ${item.kind}.` });
    components.push({ id, name, paths, kind });
  }
  const dependencies = (Array.isArray(record.dependencies) ? record.dependencies : []).flatMap(raw => {
    const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    if (typeof item.from !== 'string' || typeof item.to !== 'string' || !ids.has(item.from) || !ids.has(item.to)) { warnings.push({ code: 'invalid-config', message: 'Configured dependencies must reference configured component ids.' }); return []; }
    return [{ from: item.from, to: item.to }];
  });
  const criticalPaths = Array.isArray(record.criticalPaths) ? record.criticalPaths.filter((path): path is string => typeof path === 'string') : [];
  return { components, dependencies, criticalPaths, warnings };
}

function componentKind(root: string, manifest?: string): ArchitectureComponentKind {
  const name = base(root).toLowerCase();
  if (['test', 'tests', 'testing', 'e2e'].includes(name)) return 'tests';
  if (['docs', 'documentation'].includes(name)) return 'documentation';
  if (['tools', 'programs', 'cli', 'apps', 'frontend', 'client'].includes(name)) return 'application';
  if (['backend', 'server', 'services'].includes(name)) return 'service';
  if (root === 'src-tauri') return 'runtime';
  if (manifest === 'CMakeLists.txt' || manifest === 'Makefile' || manifest === 'meson.build' || manifest?.startsWith('BUILD')) return 'library';
  return 'package';
}

function componentName(root: string): string {
  const name = base(root).toLowerCase();
  if (root === '.') return 'Repository Root';
  if (root === 'src-tauri') return 'Desktop Runtime';
  if (name === 'lib' || name === 'library') return 'Library Core';
  if (name === 'tests' || name === 'test') return 'Test Suite';
  if (name === 'programs') return 'Programs';
  return title(base(root));
}

function buildCandidates(input: RepositoryArchitectureInput, config: ParsedConfig): Candidate[] {
  const result = new Map<string, Candidate>();
  const add = (root: string, evidence: ArchitectureEvidence, score: number, manifestPaths: string[] = [], configured = false, forced?: { id: string; name: string; kind: ArchitectureComponentKind; patterns: string[] }) => {
    root = normalizedRoot(root);
    const id = forced ? stableComponentId(input.repositoryId, `configured:${forced.id}`) : stableComponentId(input.repositoryId, `root:${root}`);
    const previous = result.get(id);
    const component: ArchitectureComponent = previous?.component ?? { id, repositoryId: input.repositoryId, name: forced?.name ?? componentName(root), kind: forced?.kind ?? componentKind(root, manifestPaths[0] && base(manifestPaths[0])), rootPaths: [root], manifestPaths: [], configured, owners: [], confidence: confidence(score) };
    component.manifestPaths = [...new Set([...component.manifestPaths, ...manifestPaths])];
    if (score > component.confidence.score) component.confidence = confidence(score);
    result.set(id, { component, roots: [...new Set([...(previous?.roots ?? []), root])], configuredPatterns: forced?.patterns, evidence: !previous || score >= previous.component.confidence.score ? evidence : previous.evidence });
  };
  for (const configured of config.components) add('.', { type: 'configured-path', source: '.snowdevil/architecture.yml', detail: `Configured component ${configured.id}.` }, .98, ['.snowdevil/architecture.yml'], true, { id: configured.id, name: configured.name, kind: configured.kind ?? 'unknown', patterns: configured.paths });
  const paths = new Set(input.files.map(file => file.path));
  const manifests = input.files.filter(file => MANIFEST_NAMES.has(base(file.path)) || base(file.path).endsWith('.csproj') || base(file.path).endsWith('.sln'));
  for (const file of manifests) {
    const root = parent(file.path);
    add(root, { type: 'manifest-boundary', source: file.path, detail: `Matched the ${base(file.path)} project boundary.` }, .9, [file.path]);
  }
  const rootBuild = manifests.some(file => parent(file.path) === '.' && ['CMakeLists.txt', 'Makefile', 'meson.build', 'BUILD', 'BUILD.bazel'].includes(base(file.path)));
  const conventional = new Set<string>();
  for (const file of input.files) {
    const parts = file.path.split('/');
    if (['apps', 'packages', 'libs', 'services', 'modules', 'crates'].includes(parts[0]) && parts[1]) conventional.add(`${parts[0]}/${parts[1]}`);
    if (['src-tauri', 'backend', 'frontend', 'server', 'client', 'tests', 'test', 'tools', 'programs'].includes(parts[0])) conventional.add(parts[0]);
    if (parts[0] === 'src' && parts[1] === 'components' && parts[2]) conventional.add(`src/components/${parts[2]}`);
    if (parts[0] === 'src' && ['app', 'styles', 'palette', 'stores', 'analytics', 'browser', 'hooks', 'services', 'repository', 'simulator'].includes(parts[1])) conventional.add(`src/${parts[1]}`);
    if (rootBuild && ['lib', 'tests', 'test', 'programs', 'tools', 'contrib', 'examples', 'src', 'include'].includes(parts[0])) conventional.add(parts[0]);
  }
  for (const root of conventional) {
    const buildEvidence = rootBuild && ['lib', 'tests', 'test', 'programs', 'tools', 'contrib', 'examples', 'src', 'include'].includes(root);
    add(root, { type: buildEvidence ? 'build-target' : 'directory', source: root, detail: buildEvidence ? 'Matched a source or target boundary beneath a repository build manifest.' : 'Matched a conventional repository component boundary.' }, buildEvidence ? .82 : .68);
  }
  if (!result.size && paths.size) {
    const topRoots = new Set([...paths].map(path => path.split('/')[0]).filter(root => [...paths].some(path => path.startsWith(`${root}/`))));
    for (const root of [...topRoots].slice(0, 30)) add(root, { type: 'directory', source: root, detail: 'Inferred from a top-level directory because no stronger boundary was available.' }, .48);
  }
  return [...result.values()];
}

interface OwnerRule { pattern: string; owners: string[]; source: string }
function parseCodeowners(contents: Record<string, string>): OwnerRule[] {
  const source = CODEOWNERS_PATHS.find(path => typeof contents[path] === 'string');
  if (!source) return [];
  return contents[source].split(/\r?\n/).flatMap(line => {
    const clean = line.trim();
    if (!clean || clean.startsWith('#')) return [];
    const fields = clean.split(/\s+/); const pattern = fields.shift(); const owners = fields.filter(value => value.startsWith('@'));
    return pattern && owners.length ? [{ pattern, owners, source }] : [];
  });
}

function ownerFor(path: string, rules: OwnerRule[]): ArchitectureOwner[] {
  let matched: OwnerRule | undefined;
  for (const rule of rules) {
    const pattern = rule.pattern.replace(/^\//, '').replace(/\/$/, '/**');
    if (matchesGlob(path, pattern) || (!pattern.includes('/') && matchesGlob(base(path), pattern))) matched = rule;
  }
  return matched?.owners.map(login => ({ login, source: `${matched!.source}: ${matched!.pattern}` })) ?? [];
}

function resolveRelative(source: string, target: string): string {
  const parts = parent(source) === '.' ? [] : parent(source).split('/');
  for (const part of target.split('/')) { if (part === '..') parts.pop(); else if (part !== '.' && part) parts.push(part); }
  return parts.join('/').replace(/\.(tsx?|jsx?|c|cc|cpp|cxx|h|hh|hpp|hxx|rs|py)$/, '');
}

function uniqueTarget(candidate: string, files: Set<string>): string | undefined {
  const variants = [candidate, ...[...SOURCE_EXTENSIONS].map(ext => `${candidate}.${ext}`), `${candidate}/index.ts`, `${candidate}/index.tsx`];
  const exact = variants.find(path => files.has(path));
  if (exact) return exact;
  const suffixes = [...files].filter(path => path.endsWith(`/${candidate}`) || variants.some(value => path.endsWith(`/${value}`)));
  return suffixes.length === 1 ? suffixes[0] : undefined;
}

function dependencyEvidence(path: string, text: string, files: Set<string>): Array<{ targetPath: string; kind: ComponentDependency['kind']; evidence: ArchitectureEvidence }> {
  const result: Array<{ targetPath: string; kind: ComponentDependency['kind']; evidence: ArchitectureEvidence }> = [];
  for (const match of text.matchAll(/^\s*#\s*include\s*"([^"]+)"/gm)) {
    const targetPath = uniqueTarget(resolveRelative(path, match[1]), files) ?? uniqueTarget(match[1], files);
    if (targetPath) result.push({ targetPath, kind: 'include', evidence: { type: 'include', source: path, detail: `Local include "${match[1]}" resolves to ${targetPath}.` } });
  }
  for (const match of text.matchAll(/(?:from\s+|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]/g)) {
    if (!match[1].startsWith('.')) continue;
    const targetPath = uniqueTarget(resolveRelative(path, match[1]), files);
    if (targetPath) result.push({ targetPath, kind: 'import', evidence: { type: 'import', source: path, detail: `Relative import ${match[1]} resolves to ${targetPath}.` } });
  }
  for (const match of text.matchAll(/<ProjectReference\s+Include=["']([^"']+)["']/gi)) {
    const targetPath = uniqueTarget(resolveRelative(path, match[1].replace(/\\/g, '/')), files);
    if (targetPath) result.push({ targetPath, kind: 'project-reference', evidence: { type: 'project-reference', source: path, detail: `Project reference resolves to ${targetPath}.` } });
  }
  return result;
}

export function buildRepositoryArchitectureSnapshot(input: RepositoryArchitectureInput, generatedAt = new Date().toISOString()): ArchitectureSnapshot {
  const config = parseConfig(input.config);
  const candidates = buildCandidates(input, config);
  const codeowners = parseCodeowners(input.contents);
  const mappings = input.files.map(file => {
    const configured = candidates.filter(candidate => candidate.configuredPatterns?.some(pattern => matchesGlob(file.path, pattern))).sort((a, b) => (b.configuredPatterns?.[0]?.length ?? 0) - (a.configuredPatterns?.[0]?.length ?? 0))[0];
    const inferred = candidates.filter(candidate => candidate.roots.some(root => pathWithin(file.path, root))).sort((a, b) => Math.max(...b.roots.map(root => root.length)) - Math.max(...a.roots.map(root => root.length)))[0];
    const candidate = configured ?? inferred;
    const reason: ArchitectureEvidence | undefined = candidate ? { ...candidate.evidence, detail: `${candidate.evidence.detail} Mapped ${file.path} to ${candidate.component.name}.` } : undefined;
    const owners = ownerFor(file.path, codeowners);
    return { path: file.path, componentId: candidate?.component.id, confidence: candidate ? candidate.component.confidence : confidence(0), reasons: [...(reason ? [reason] : []), ...owners.map(owner => ({ type: 'codeowners' as const, source: owner.source, detail: `Owned by ${owner.login}.` }))] };
  });
  const mappingByPath = new Map(mappings.map(mapping => [mapping.path, mapping]));
  const files = new Set(input.files.map(file => file.path));
  const edges = new Map<string, ComponentDependency>();
  const addEdge = (fromComponentId: string, toComponentId: string, kind: ComponentDependency['kind'], evidence: ArchitectureEvidence, score: number) => {
    if (fromComponentId === toComponentId) return;
    const key = `${fromComponentId}:${toComponentId}:${kind}`;
    const previous = edges.get(key);
    if (previous) { if (previous.evidence.length < 12) previous.evidence.push(evidence); return; }
    edges.set(key, { fromComponentId, toComponentId, kind, confidence: confidence(score), evidence: [evidence] });
  };
  for (const [path, text] of Object.entries(input.contents)) {
    const from = mappingByPath.get(path)?.componentId;
    if (!from) continue;
    for (const dependency of dependencyEvidence(path, text, files)) {
      const to = mappingByPath.get(dependency.targetPath)?.componentId;
      if (to) addEdge(from, to, dependency.kind, dependency.evidence, dependency.kind === 'include' || dependency.kind === 'project-reference' ? .9 : .82);
    }
  }
  const packageComponents = new Map<string, string>();
  for (const [path, text] of Object.entries(input.contents)) {
    if (base(path) !== 'package.json') continue;
    try { const manifest = JSON.parse(text) as { name?: unknown }; const componentId = mappingByPath.get(path)?.componentId; if (componentId && typeof manifest.name === 'string') packageComponents.set(manifest.name, componentId); } catch { /* malformed manifests lower coverage without crashing */ }
  }
  for (const [path, text] of Object.entries(input.contents)) {
    const from = mappingByPath.get(path)?.componentId;
    if (!from) continue;
    if (base(path) === 'package.json') {
      try {
        const manifest = JSON.parse(text) as Record<string, unknown>;
        for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) {
          const dependencies = manifest[section] && typeof manifest[section] === 'object' ? manifest[section] as Record<string, unknown> : {};
          for (const name of Object.keys(dependencies)) { const to = packageComponents.get(name); if (to) addEdge(from, to, 'manifest', { type: 'manifest-boundary', source: path, detail: `${section} references workspace package ${name}.` }, .94); }
        }
      } catch { /* warning is represented through incomplete manifest coverage */ }
    }
    if (base(path) === 'Cargo.toml') {
      for (const match of text.matchAll(/(?:^|\n)\s*[\w-]+\s*=\s*\{[^}]*path\s*=\s*["']([^"']+)["'][^}]*\}/g)) {
        const targetManifest = `${resolveRelative(path, match[1])}/Cargo.toml`.replace(/^\.\//, '');
        const to = mappingByPath.get(targetManifest)?.componentId;
        if (to) addEdge(from, to, 'manifest', { type: 'manifest-boundary', source: path, detail: `Cargo path dependency resolves to ${targetManifest}.` }, .96);
      }
    }
    if (base(path) === 'go.work') {
      for (const match of text.matchAll(/(?:^|\n)\s*use\s+(?:\(\s*)?([^\s)]+)/g)) { const target = `${resolveRelative(path, match[1])}/go.mod`; const to = mappingByPath.get(target)?.componentId; if (to) addEdge(from, to, 'workspace', { type: 'workspace-member', source: path, detail: `Go workspace member resolves to ${target}.` }, .94); }
    }
    if (base(path).startsWith('settings.gradle')) {
      for (const match of text.matchAll(/include\s*\(?["']:([^"']+)["']/g)) { const targetName = match[1].split(':').pop(); const target = candidates.find(candidate => base(candidate.roots[0]) === targetName); if (target) addEdge(from, target.component.id, 'workspace', { type: 'workspace-member', source: path, detail: `Gradle includes project ${match[1]}.` }, .9); }
    }
    if (base(path) === 'CMakeLists.txt' || base(path).endsWith('.cmake')) {
      for (const match of text.matchAll(/target_link_libraries\s*\(\s*([^\s)]+)\s+([^)]+)\)/gsi)) {
        const tokens = match[2].split(/\s+/).filter(token => token && !['PRIVATE','PUBLIC','INTERFACE','debug','optimized'].includes(token));
        for (const token of tokens) { const target = candidates.find(candidate => base(candidate.roots[0]).toLowerCase() === token.toLowerCase() || candidate.component.name.replace(/\s+/g, '').toLowerCase() === token.replace(/[^\w]/g, '').toLowerCase()); if (target) addEdge(from, target.component.id, 'build-target', { type: 'build-target', source: path, detail: `CMake target ${match[1]} links ${token}.` }, .82); }
      }
    }
  }
  const configuredIds = new Map(config.components.map(item => [item.id, stableComponentId(input.repositoryId, `configured:${item.id}`)]));
  for (const dependency of config.dependencies) {
    const from = configuredIds.get(dependency.from); const to = configuredIds.get(dependency.to);
    if (from && to) addEdge(from, to, 'configured', { type: 'configured-path', source: '.snowdevil/architecture.yml', detail: `Configured dependency ${dependency.from} → ${dependency.to}.` }, .99);
  }
  const components = candidates.map(candidate => {
    const ownedFiles = mappings.filter(mapping => mapping.componentId === candidate.component.id).flatMap(mapping => mapping.reasons.filter(reason => reason.type === 'codeowners').map(reason => reason.detail.replace(/^Owned by |\.$/g, '')));
    candidate.component.owners = [...new Set(ownedFiles)].map(login => ({ login, source: 'CODEOWNERS' }));
    return candidate.component;
  }).filter(component => mappings.some(mapping => mapping.componentId === component.id));
  const unmappedFiles = mappings.filter(mapping => !mapping.componentId).map(mapping => mapping.path);
  const warnings: ArchitectureWarning[] = [...config.warnings, ...input.warnings.map(message => ({ code: message.includes('truncated') ? 'truncated-tree' as const : message.includes('capped') ? 'content-cap' as const : message.includes('Invalid') ? 'invalid-config' as const : 'inaccessible-content' as const, message }))];
  if (!components.length) warnings.push({ code: 'unsupported-layout', message: 'No reliable project or component boundaries were found.' });
  const ownedFiles = mappings.filter(mapping => mapping.reasons.some(reason => reason.type === 'codeowners')).length;
  return {
    repositoryId: input.repositoryId,
    baseCommitSha: input.baseCommitSha,
    generatedAt,
    algorithmVersion: ARCHITECTURE_ALGORITHM_VERSION,
    configHash: input.configHash,
    status: input.truncated || warnings.length ? 'partial' : 'ready',
    components,
    dependencies: [...edges.values()],
    files: mappings,
    unmappedFiles,
    excludedPaths: input.excludedPaths,
    warnings,
    evidenceSummary: { mappedFiles: mappings.length - unmappedFiles.length, totalFiles: mappings.length, configured: config.components.length > 0, manifestCount: input.files.filter(file => MANIFEST_NAMES.has(base(file.path)) || base(file.path).endsWith('.csproj')).length, dependencyEvidenceCount: [...edges.values()].reduce((sum, edge) => sum + edge.evidence.length, 0), ownedFiles, requestCount: input.requestCount, exclusions: input.excludedPaths },
  };
}

export function architectureMappingConfidence(snapshot: ArchitectureSnapshot): ArchitectureConfidence {
  if (!snapshot.evidenceSummary.totalFiles) return confidence(0);
  const mapped = snapshot.files.filter(file => file.componentId);
  const evidence = mapped.reduce((sum, file) => sum + file.confidence.score, 0) / snapshot.evidenceSummary.totalFiles;
  const completeness = snapshot.status === 'ready' ? 1 : .78;
  return confidence(Math.round(evidence * completeness * 100) / 100);
}
