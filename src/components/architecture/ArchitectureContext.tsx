import { AlertTriangle, Boxes, Braces, CircleDot, FileCode2, GitBranch, Info, Network, ShieldCheck } from 'lucide-react';
import { useMemo } from 'react';
import type { ArchitectureDependencyChange, ArchitectureRisk, PullRequestArchitectureImpact } from '../../architecture/types';
import { useArchitectureStore, type ArchitectureSection } from '../../architecture/architecture-store';
import { useTabsStore } from '../../stores/tabs-store';
import { OverviewMap } from './OverviewMap';
import { FullComponentMap } from './FullComponentMap';
import './ArchitectureContext.css';



function tone(value: string) { return ['high', 'critical'].includes(value) ? 'danger' : value === 'medium' ? 'warning' : value === 'low' ? 'good' : 'info'; }
function percent(score: number) { return `${Math.round(score * 100)}%`; }
function componentName(impact: PullRequestArchitectureImpact, id?: string) { return impact.snapshot.components.find(component => component.id === id)?.name ?? 'Unmapped'; }

function MetricCard({ label, value, detail, icon, onClick }: { label: string; value: React.ReactNode; detail: string; icon: React.ReactNode; onClick?: () => void }) {
  return <article className={`architecture-metric ${onClick ? 'is-interactive' : ''}`} onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}><div className="architecture-metric__icon">{icon}</div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>;
}

function Overview({ impact, onSelect }: { impact: PullRequestArchitectureImpact; onSelect: (id: string) => void }) {
  const primary = impact.affectedComponents.find(component => component.component.id === impact.primaryComponentId);
  const dependencies = impact.dependencyChanges;
  return <div className="architecture-overview">
    <div className="architecture-overview__left">
      <article className="architecture-panel architecture-change-summary"><h3>What changed?</h3><p>This pull request primarily affects <strong>{primary?.component.name ?? 'an unmapped area'}</strong>. It changes {impact.changedFileMappings.length} {impact.changedFileMappings.length === 1 ? 'file' : 'files'} across {impact.affectedComponents.length} mapped {impact.affectedComponents.length === 1 ? 'component' : 'components'}{dependencies.length ? ` and includes ${dependencies.length} cross-component dependency ${dependencies.length === 1 ? 'change' : 'changes'}` : ''}.</p><h4>Why it matters</h4><p>{impact.risk.reasons[0]?.detail}</p><div className="architecture-evidence-note"><Info size={13}/>{impact.snapshot.status === 'ready' ? `This summary maps the patch against ${impact.snapshot.evidenceSummary.totalFiles.toLocaleString()} repository files at the exact base commit.` : impact.snapshot.warnings[0]?.message ?? 'Repository evidence is incomplete; confidence has been reduced.'}</div></article>
      <article className="architecture-panel"><header><h3>Components Affected</h3><span>{impact.affectedComponents.length}</span></header><div className="architecture-component-list">{impact.affectedComponents.map(item => <button key={item.component.id} onClick={() => onSelect(item.component.id)}><CircleDot size={13}/><span><strong>{item.component.name}</strong><small>{item.component.rootPaths.join(', ')} · {item.files.length} files</small></span><em className={`architecture-badge architecture-badge--${item.role === 'primary' ? 'info' : 'neutral'}`}>{item.role}</em><small>+{item.additions} −{item.deletions}</small></button>)}</div>{impact.unmappedFiles.length > 0 && <div className="architecture-unmapped"><AlertTriangle size={13}/>{impact.unmappedFiles.length} unmapped {impact.unmappedFiles.length === 1 ? 'file is' : 'files are'} preserved for review.</div>}</article>
    </div>
    <div className="architecture-overview__right"><OverviewMap impact={impact} onSelect={onSelect}/><BlastSummary impact={impact}/></div>
  </div>;
}

function BlastSummary({ impact }: { impact: PullRequestArchitectureImpact }) {
  return <article className="architecture-panel architecture-blast"><header><div><h3>Blast Radius</h3><p>Potentially affected areas based on bounded dependency evidence</p></div></header><div><span><small>Directly impacted</small><strong>{impact.directBlastRadius.length} components</strong><em>{impact.changedFileMappings.length} files</em></span><span><small>Indirectly impacted</small><strong>{impact.indirectBlastRadius.length} components</strong><em>one additional hop</em></span><span><small>Potential risk areas</small><strong>{impact.risk.reasons[0]?.label}</strong><em>{impact.risk.reasons.length} evidence reasons</em></span><span><small>Mapping status</small><strong>{impact.snapshot.status}</strong><em>{impact.snapshot.evidenceSummary.manifestCount} manifests · {impact.snapshot.evidenceSummary.dependencyEvidenceCount} dependency evidence</em></span></div></article>;
}

function ChangedFiles({ impact, onOpenFile }: { impact: PullRequestArchitectureImpact; onOpenFile: (path: string) => void }) {
  return <div className="architecture-files">{impact.affectedComponents.map(group => <article className="architecture-panel" key={group.component.id}><header><div><h3>{group.component.name}</h3><p>{group.component.rootPaths.join(', ')}</p></div><span>{group.files.length} files · +{group.additions} −{group.deletions}</span></header>{group.files.map(file => <button key={file.path} onClick={() => onOpenFile(file.path)}><FileCode2 size={13}/><span><strong>{file.path}</strong><small>{file.status} · {file.reasons[0]?.detail}</small></span><em className={`architecture-badge architecture-badge--${tone(file.confidence.level)}`}>{file.confidence.level} {percent(file.confidence.score)}</em><small>+{file.additions} −{file.deletions}</small></button>)}</article>)}{impact.unmappedFiles.length > 0 && <article className="architecture-panel"><header><h3>Unmapped Files</h3><span>{impact.unmappedFiles.length}</span></header>{impact.changedFileMappings.filter(file => !file.componentId).map(file => <button key={file.path} onClick={() => onOpenFile(file.path)}><AlertTriangle size={13}/><span><strong>{file.path}</strong><small>No reliable component boundary was found.</small></span></button>)}</article>}</div>;
}

function DependencyRow({ impact, change }: { impact: PullRequestArchitectureImpact; change: ArchitectureDependencyChange }) {
  return <article className="architecture-panel architecture-dependency"><header><span className={`architecture-badge architecture-badge--${change.change === 'removed' ? 'danger' : 'good'}`}>{change.change} dependency</span><em>{change.confidence.level} confidence</em></header><h3>{componentName(impact, change.fromComponentId)} <GitBranch size={14}/> {componentName(impact, change.toComponentId)}</h3><h4>Evidence</h4>{change.evidence.map(evidence => <p key={`${evidence.source}:${evidence.detail}`}><FileCode2 size={12}/><span><strong>{evidence.source}</strong><small>{evidence.detail}</small></span></p>)}</article>;
}

function RiskView({ risk }: { risk: ArchitectureRisk }) {
  return <article className="architecture-panel architecture-risk"><header><div><h3>History & Risk</h3><p>Explainable change risk from available architecture evidence</p></div><strong className={`architecture-risk__score architecture-risk__score--${tone(risk.level)}`}>{risk.level} · {risk.score}</strong></header>{risk.reasons.map(reason => <div key={reason.code}><ShieldCheck size={15}/><span><strong>{reason.label}</strong><small>{reason.detail}</small></span><em>+{reason.weight}</em></div>)}<p className="architecture-evidence-note"><Info size={13}/>Historical instability and CI evidence are not included unless they already exist in Snow Devil's cache.</p></article>;
}

export function ArchitectureContext({ impact, onSelectComponent, onOpenFile }: { impact: PullRequestArchitectureImpact; onSelectComponent: (id: string) => void; onOpenFile: (path: string) => void }) {
  const activeTabId = useTabsStore(s => s.activeTabId);
  const section = useArchitectureStore(s => s.states[activeTabId]?.section ?? 'overview');
  const setSection = (sec: ArchitectureSection) => useArchitectureStore.getState().setSection(activeTabId, sec);
  
  const available = useMemo(() => new Set<ArchitectureSection>(['overview', 'map', 'files', 'blast', 'risk', ...(impact.dependencyChanges.length ? ['dependencies' as const] : [])]), [impact.dependencyChanges.length]);
  const tabs: Array<[ArchitectureSection, string, React.ReactNode]> = [['overview', 'Overview', <Boxes size={12}/>], ['map', 'Component Map', <Network size={12}/>], ['files', 'Changed Files', <FileCode2 size={12}/>], ['dependencies', 'Dependencies', <Braces size={12}/>], ['blast', 'Blast Radius', <GitBranch size={12}/>], ['risk', 'History & Risk', <ShieldCheck size={12}/>]];
  const primary = impact.snapshot.components.find(component => component.id === impact.primaryComponentId);
  const warning = impact.snapshot.warnings[0]?.message;
  const ready = impact.snapshot.status === 'ready';
  return <div className="architecture-context theme-blueprint"><header className="architecture-context__title"><div><span>Architecture Context</span><h2>Architecture Impact</h2><p>Understand how this change fits into the codebase</p></div><div className="architecture-freshness"><span className={`architecture-badge architecture-badge--${ready ? 'good' : 'warning'}`}>{ready ? 'Repository snapshot ready' : `${impact.snapshot.status} repository snapshot`}</span><small>{warning ?? `${impact.snapshot.evidenceSummary.totalFiles.toLocaleString()} repository files analyzed`} · {new Date(impact.snapshot.generatedAt).toLocaleString()}</small></div></header>
    <section className="architecture-metrics">
      <MetricCard label="Primary Component" value={primary?.name ?? 'Unmapped'} detail={primary ? `${primary.confidence.level} confidence` : 'No reliable boundary'} icon={<CircleDot size={16}/>} onClick={primary ? () => { setSection('map'); setTimeout(() => onSelectComponent(primary.id), 50); } : undefined} />
      <MetricCard label="Components Affected" value={impact.affectedComponents.length} detail={`${impact.changedFileMappings.length} changed files`} icon={<Boxes size={16}/>} onClick={() => setSection('files')} />
      <MetricCard label="Dependencies Impacted" value={impact.dependencyChanges.length} detail={impact.dependencyChanges.length ? 'Patch-backed changes' : 'None detected'} icon={<GitBranch size={16}/>} onClick={impact.dependencyChanges.length ? () => setSection('dependencies') : undefined} />
      <MetricCard label="Change Risk" value={<span className={`architecture-badge architecture-badge--${tone(impact.risk.level)}`}>{impact.risk.level}</span>} detail={`${impact.risk.reasons.length} evidence reasons`} icon={<AlertTriangle size={16}/>} onClick={() => setSection('risk')} />
      <MetricCard label="Mapping Confidence" value={<span className={`architecture-badge architecture-badge--${tone(impact.confidence.level)}`}>{impact.confidence.level}</span>} detail={`${percent(impact.confidence.score)} of weighted evidence`} icon={<ShieldCheck size={16}/>} onClick={() => setSection('blast')} />
    </section>
    <nav className="architecture-tabs" role="tablist" aria-label="Architecture Context sections">{tabs.filter(([id]) => available.has(id)).map(([id, label, icon]) => <button key={id} role="tab" aria-selected={section === id} className={section === id ? 'is-active' : ''} onClick={() => setSection(id)}>{icon}{label}</button>)}</nav>
    <main className="architecture-context__content">{section === 'overview' && <Overview impact={impact} onSelect={onSelectComponent}/>} {section === 'map' && <FullComponentMap impact={impact} onSelect={onSelectComponent}/>} {section === 'files' && <ChangedFiles impact={impact} onOpenFile={onOpenFile}/>} {section === 'dependencies' && <div className="architecture-dependencies">{impact.dependencyChanges.map(change => <DependencyRow key={`${change.change}:${change.fromComponentId}:${change.toComponentId}`} impact={impact} change={change}/>)}</div>} {section === 'blast' && <BlastSummary impact={impact}/>} {section === 'risk' && <RiskView risk={impact.risk}/>}</main>
  </div>;
}
