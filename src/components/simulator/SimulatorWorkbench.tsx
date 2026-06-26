import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Filter, Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";
import { useAccountSimulator } from "../../hooks/useAccountSimulator";
import { useRepositorySimulator } from "../../hooks/useRepositorySimulator";
import { useSimulatorPlayback } from "../../hooks/useSimulatorPlayback";
import { useAuthStore } from "../../stores/auth-store";
import { useModeStore } from "../../stores/mode-store";
import { useDemoManifest } from "../../hooks/useDemoData";
import { useFlowStore } from "../../stores/flow-store";
import { useTabsStore } from "../../stores/tabs-store";
import { RepositorySelector } from "../workspace/RepositorySelector";
import "./SimulatorWorkbench.css";
import { SimulatorTimeline } from "./ui/SimulatorTimeline";
import { SimulatorEventStream } from "./ui/SimulatorEventStream";
import { SimulatorEntityList } from "./ui/SimulatorEntityList";
import { SimulatorMetrics } from "./ui/SimulatorMetrics";
import { SimulatorStageColumn } from "./ui/SimulatorStageColumn";
import { Select } from "../ui/Select";
import { reconstructState } from "../../simulator/simulator-reducer";
import { classifyActor } from "../../lib/delivery-semantics";
import { safeSimulatorExplanation, safeSimulatorTitle } from "../../simulator/simulator-errors";
import { useTabRefresh } from "../../hooks/useTabRefresh";

const STAGES = [
  "issues",
  "coding",
  "pull_requests",
  "review",
  "checks",
  "ready",
  "merged",
  "released",
  "deployed"
];

function setRange(setSince: (s: string) => void, setUntil: (s: string) => void, days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  setSince(d.toISOString());
  setUntil(new Date().toISOString());
}

export function SimulatorWorkbench({ mode }: { mode: "account" | "repository" }) {
  const { session } = useAuthStore();
  const appMode = useModeStore(state => state.mode);
  const { data: demoManifest } = useDemoManifest();
  const login = appMode === 'demo' ? (demoManifest?.identity.login || 'snowdevil-demo') : session.status === "connected" ? session.account.login : "unknown";
  
  const defaultDemoRepo = appMode === 'demo' && mode === 'repository' && demoManifest?.repositories[0]
    ? { id: demoManifest.repositories[0].id, nameWithOwner: demoManifest.repositories[0].nameWithOwner }
    : null;
  const [selectedRepoState, setSelectedRepo] = useState<{id: string, nameWithOwner: string} | null>(null);
  const selectedRepo = selectedRepoState || defaultDemoRepo;
  const [selectedEntityId, setSelectedEntityId] = useState<string | undefined>(undefined);
  const [selectedEventId, setSelectedEventId] = useState<string | undefined>(undefined);
  const [expansion, setExpansion] = useState<{ context: string; stages: Set<string> }>({ context: '', stages: new Set() });
  const [showFilters, setShowFilters] = useState(false);
  const [showCoverage, setShowCoverage] = useState(false);
  const [customRange, setCustomRange] = useState(false);
  const [filters, setFilters] = useState({ repository: 'all', involvement: 'all', entityType: 'all', stage: 'all', actor: 'humans', checks: 'all', review: 'all', confidence: 'all', labels: '', includeBots: false });

  const repoOwner = selectedRepo ? selectedRepo.nameWithOwner.split("/")[0] : "";
  const repoName = selectedRepo ? selectedRepo.nameWithOwner.split("/")[1] : "";

  const accountSim = useAccountSimulator(login);
  const repoSim = useRepositorySimulator(repoOwner, repoName);

  const activeTabId = useTabsStore(s => s.activeTabId);
  const setTabState = useFlowStore(s => s.setTabState);

  const activeSim = mode === "account" ? accountSim : repoSim;
  const { events, loadState, details, since, until, setSince, setUntil, refresh } = activeSim;
  useTabRefresh(activeTabId, useMemo(() => ({ label: "Refresh tab", refresh }), [refresh]));

  const playback = useSimulatorPlayback(events, since, until);
  const fullStateArray = useMemo(() => Array.from(playback.currentState.values()).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.id.localeCompare(b.id)), [playback.currentState]);
  const currentState = useMemo(() => reconstructState(events, until), [events, until]);
  const stateArray = useMemo(() => fullStateArray.filter(entity => {
    if (mode === 'account' && filters.repository !== 'all' && entity.repositoryId !== filters.repository) return false;
    if (filters.entityType !== 'all' && entity.subjectType !== filters.entityType) return false;
    if (filters.stage !== 'all' && entity.stage !== filters.stage) return false;
    const actorType = classifyActor(entity.author?.login);
    const isBot = ['dependabot', 'renovate', 'other_bot'].includes(actorType);
    if (!filters.includeBots && isBot || filters.actor === 'humans' && isBot || filters.actor === 'bots' && !isBot || filters.actor === 'dependabot' && actorType !== 'dependabot' || filters.actor === 'renovate' && actorType !== 'renovate') return false;
    if (filters.checks !== 'all' && entity.checkState !== filters.checks) return false;
    if (filters.review !== 'all' && entity.reviewState !== filters.review) return false;
    if (filters.confidence !== 'all' && entity.sourceCompleteness !== filters.confidence) return false;
    if (filters.labels.trim() && !entity.labels.some(label => label.name.toLowerCase().includes(filters.labels.trim().toLowerCase()))) return false;
      if (
        mode === 'account'
        && filters.involvement !== 'all'
        && !entity.inclusionReason?.includes(filters.involvement)
      ) return false;
    return true;
  }), [filters, fullStateArray, mode]);
  const visibleEntityIds = useMemo(() => new Set(stateArray.map(entity => entity.id)), [stateArray]);
  const visibleEvents = useMemo(() => events.filter(event => visibleEntityIds.has(event.subjectId)), [events, visibleEntityIds]);
  const repositoryOptions = useMemo(() => Array.from(new Set(events.map(event => event.repositoryId))).sort(), [events]);
  const activeFilterCount = Object.entries(filters).filter(([key, value]) => key === 'includeBots' ? value === true : value !== 'all' && value !== 'humans' && value !== '').length;
  const expansionContext = `${mode}:${selectedRepo?.id ?? 'account'}:${since}:${until}`;
  const expandedStages = expansion.context === expansionContext ? expansion.stages : new Set<string>();

  useEffect(() => {
    if (selectedEventId) {
       const ev = events.find(e => e.id === selectedEventId);
       if (ev) {
         setTabState(activeTabId, { selectedSimulatorEvent: ev, selectedSimulatorEntity: undefined, selectedSimulatorCurrentEntity: currentState.get(ev.subjectId) });
       } else {
         setTabState(activeTabId, { selectedSimulatorEvent: undefined, selectedSimulatorEntity: undefined });
       }
    } else if (selectedEntityId) {
       const ent = stateArray.find(e => e.id === selectedEntityId);
       if (ent) {
         setTabState(activeTabId, { selectedSimulatorEntity: ent, selectedSimulatorCurrentEntity: currentState.get(ent.id), selectedSimulatorEvent: undefined });
       } else {
         setTabState(activeTabId, { selectedSimulatorEntity: undefined, selectedSimulatorEvent: undefined });
       }
    } else {
       setTabState(activeTabId, { selectedSimulatorEntity: undefined, selectedSimulatorEvent: undefined });
    }
  }, [selectedEntityId, selectedEventId, stateArray, events, activeTabId, currentState, setTabState]);
  useEffect(() => {
    if (selectedEntityId && !visibleEntityIds.has(selectedEntityId)) { setSelectedEntityId(undefined); setSelectedEventId(undefined); }
  }, [selectedEntityId, visibleEntityIds]);

  if (appMode !== 'demo' && session.status === "checking") {
    return <div style={{ padding: 32 }}>Resolving authenticated account...</div>;
  }
  if (appMode !== 'demo' && session.status !== "connected") {
    return <div style={{ padding: 32 }}>Authentication required. Please sign in to GitHub to use the simulator.</div>;
  }

  const renderCanvas = () => {
    if (mode === "repository" && !selectedRepo) {
      return (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)", flexDirection: "column" }}>
          <h2>Repository Simulator</h2>
          <p>Please select a repository from the header to view its simulated activity flow.</p>
        </div>
      );
    }
    if (loadState === "error") {
      const failure = details.refreshError ?? details.sourceFailures[0];
      const category = failure?.category ?? "unknown";
      return <div className="simulator-load-state simulator-load-state--error" role="alert">
        <AlertTriangle size={20} />
        <div>
          <h3>{safeSimulatorTitle(category)}</h3>
          <p>{failure?.message ?? safeSimulatorExplanation(category)}</p>
          {details.cacheError && <small>Cached history could not be used: {details.cacheError.message}</small>}
          {details.sourceFailures.length > 1 && <small>{details.sourceFailures.length} account sources failed.</small>}
          <button className="simulator-control simulator-control--primary" onClick={refresh}><RotateCcw size={13} /> Retry</button>
        </div>
      </div>;
    }
    if (loadState === "loading_initial") {
      return <div style={{ flex: 1, padding: 32 }}>Loading historical events...</div>;
    }
    if (events.length === 0 && loadState !== "refreshing" && loadState !== "idle") {
      return (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)", flexDirection: "column" }}>
          <h2>Empty Result</h2>
          <p>No qualifying GitHub activity was found in the selected range.</p>
        </div>
      );
    }

    return (
      <div className="simulator-canvas">
        
        {/* Playback Toolbar and Timeline */}
        <div className="simulator-playback">
          <div className="simulator-controls">
             <button className="simulator-control" onClick={() => playback.setCursorManual(since)} title="Reset to start"><SkipBack size={13} /> Start</button>
             <button className="simulator-control" onClick={playback.stepBackward}><ChevronLeft size={14} /> Step Back</button>
             <button className="simulator-control simulator-control--primary" onClick={playback.togglePlay}>
               {playback.isPlaying ? <><Pause size={13} fill="currentColor" /> Pause</> : <><Play size={13} fill="currentColor" /> Play</>}
             </button>
             <button className="simulator-control" onClick={playback.stepForward}>Step Forward <ChevronRight size={14} /></button>
             <button className="simulator-control" onClick={() => playback.setCursorManual(until)}>Jump to latest <SkipForward size={13} /></button>
             <Select value={String(playback.speedMultiplier)} ariaLabel="Simulator speed" className="simulator-speed-select" onChange={value => playback.setSpeedMultiplier(Number(value))} options={[0.5, 1, 2, 4].map(value => ({ value: String(value), label: `${value}×` }))} />
             
             <span className="simulator-control-divider" />
             <div className="simulator-range" aria-label="History range">
               {[1, 7, 30, 90].map(days => <button key={days} onClick={() => { setCustomRange(false); setRange(setSince, setUntil, days); }}>{days === 1 ? "24h" : `${days}d`}</button>)}<button className={customRange ? 'is-active' : ''} onClick={() => setCustomRange(true)}>Custom</button>
             </div>
             <button className="simulator-control simulator-refresh" onClick={refresh}><RotateCcw size={13} /> Refresh</button>
             <button className="simulator-control" aria-expanded={showFilters} onClick={() => setShowFilters(value => !value)}><Filter size={13} /> Filters <span className="simulator-filter-count">{activeFilterCount}</span></button>
          </div>
          {customRange && <div className="simulator-custom-range"><label>Start<input type="datetime-local" value={since.slice(0, 16)} max={until.slice(0, 16)} onChange={event => setSince(new Date(event.target.value).toISOString())} /></label><label>End<input type="datetime-local" value={until.slice(0, 16)} min={since.slice(0, 16)} onChange={event => setUntil(new Date(event.target.value).toISOString())} /></label></div>}
          {showFilters && <div className="simulator-filter-panel" aria-label="Simulator filters">
            {mode === 'account' && <><label>Repositories<Select ariaLabel="Simulator repository filter" searchable value={filters.repository} onChange={value => setFilters(current => ({ ...current, repository: value }))} options={[{ value: 'all', label: 'All repositories' }, ...repositoryOptions.map(value => ({ value, label: value }))]} /></label><label>Involvement<Select ariaLabel="Simulator involvement filter" value={filters.involvement} onChange={value => setFilters(current => ({ ...current, involvement: value }))} options={[{ value: 'all', label: 'All involvement' }, { value: 'authored_by_you', label: 'Authored by me' }, { value: 'assigned_to_you', label: 'Assigned to me' }, { value: 'review_requested_from_you', label: 'Review requested from me' }, { value: 'reviewed_by_you', label: 'Reviewed by me' }]} /></label></>}
            <label>Entity type<Select ariaLabel="Simulator entity type" value={filters.entityType} onChange={value => setFilters(current => ({ ...current, entityType: value }))} options={[{ value: 'all', label: 'All entity types' }, ...['issue', 'pull_request', 'branch', 'commit', 'workflow_run', 'check_suite', 'release', 'deployment'].map(value => ({ value, label: value.replace(/_/g, ' ') }))]} /></label>
            <label>Lifecycle stage<Select ariaLabel="Simulator lifecycle stage" value={filters.stage} onChange={value => setFilters(current => ({ ...current, stage: value }))} options={[{ value: 'all', label: 'All stages' }, ...STAGES.map(value => ({ value, label: value.replace(/_/g, ' ') }))]} /></label>
            <label>Actor<Select ariaLabel="Simulator actor" value={filters.actor} onChange={value => setFilters(current => ({ ...current, actor: value, includeBots: value !== 'humans' }))} options={[{ value: 'humans', label: 'Humans only' }, { value: 'everyone', label: 'Everyone' }, { value: 'bots', label: 'Bots only' }, { value: 'dependabot', label: 'Dependabot' }, { value: 'renovate', label: 'Renovate' }]} /></label>
            <label>Checks<Select ariaLabel="Simulator checks state" value={filters.checks} onChange={value => setFilters(current => ({ ...current, checks: value }))} options={[{ value: 'all', label: 'All check states' }, ...['unknown', 'queued', 'running', 'success', 'failure', 'cancelled'].map(value => ({ value, label: value }))]} /></label>
            <label>Review<Select ariaLabel="Simulator review state" value={filters.review} onChange={value => setFilters(current => ({ ...current, review: value }))} options={[{ value: 'all', label: 'All review states' }, ...['none', 'requested', 'approved', 'changes_requested'].map(value => ({ value, label: value.replace(/_/g, ' ') }))]} /></label>
            <label>Confidence<Select ariaLabel="Simulator confidence" value={filters.confidence} onChange={value => setFilters(current => ({ ...current, confidence: value }))} options={[{ value: 'all', label: 'All confidence' }, { value: 'complete', label: 'Exact / complete' }, { value: 'partial', label: 'Partial' }, { value: 'unknown', label: 'Unknown' }]} /></label>
            <label>Labels<input value={filters.labels} onChange={event => setFilters(current => ({ ...current, labels: event.target.value }))} placeholder="Label contains…" /></label>
            <button className="analytics-button" onClick={() => setFilters({ repository: 'all', involvement: 'all', entityType: 'all', stage: 'all', actor: 'humans', checks: 'all', review: 'all', confidence: 'all', labels: '', includeBots: false })}>Clear filters</button><span>{stateArray.length} of {fullStateArray.length} entities</span>
          </div>}
          {(details.stale || details.sourceFailures.length > 0) && <div className="simulator-partial-banner">
            <AlertTriangle size={14} />
            <span>
              <strong>{details.stale ? "Showing cached simulator history." : "Partial simulator history."}</strong>{" "}
              {details.stale && details.cacheRange ? `Cached range ${new Date(details.cacheRange.since).toLocaleDateString()} – ${new Date(details.cacheRange.until).toLocaleDateString()}. ` : ""}
              {details.sourceFailures.length > 0 ? `${details.loadedSources} of ${details.totalSources} source${details.totalSources === 1 ? "" : "s"} loaded; ${details.sourceFailures.length} failed.` : ""}
            </span>
            <button type="button" onClick={refresh}>Retry</button>
          </div>}
          
          <SimulatorTimeline
            since={since}
            until={until}
            cursor={playback.cursor}
            onCursorChange={playback.setCursorManual}
            isPlaying={playback.isPlaying}
          />
        </div>

        {/* Workflow Simulation Canvas */}
        <div className="simulator-board">
          {STAGES.map(stage => {
            const entitiesInStage = stateArray.filter(e => e.stage === stage);
            const isExpanded = expandedStages.has(stage);
            return <SimulatorStageColumn key={stage} stage={stage} entities={entitiesInStage} expanded={isExpanded} selectedEntityId={selectedEntityId} onSelect={entity => { setSelectedEntityId(entity.id); setSelectedEventId(undefined); }} onExpand={() => setExpansion(current => {
              const stages = current.context === expansionContext ? new Set(current.stages) : new Set<string>();
              if (stages.has(stage)) stages.delete(stage);
              else stages.add(stage);
              return { context: expansionContext, stages };
            })} />;
          })}
        </div>

        <div className="simulator-lower-deck">
          <SimulatorEntityList 
             entities={stateArray} 
             selectedId={selectedEntityId} 
             onSelect={(id) => { setSelectedEntityId(id); setSelectedEventId(undefined); }} 
          />
          <SimulatorEventStream 
             events={visibleEvents}
             cursor={playback.cursor} 
             selectedEventId={selectedEventId}
             onSelectEvent={(id) => { const selected = events.find(event => event.id === id); if (selected) { playback.setCursorManual(selected.occurredAt); setSelectedEntityId(selected.subjectId); } setSelectedEventId(id); }}
          />
          <SimulatorMetrics entities={stateArray} events={visibleEvents.filter(event => event.occurredAt <= playback.cursor)} />
        </div>

      </div>
    );
  };

  return (
    <div className="simulator-workbench">
      <header className="simulator-header">
        <div className="simulator-heading">
          <h2>
            {mode === "account" ? "Account Simulator" : "Repository Simulator"}
            {appMode === 'demo' && <span className="simulator-context">Demo Mode</span>}
            {mode === "account" && (
               <span className="simulator-context">
                 {session.status === "connected" && session.account.avatarUrl && (
                   <img src={session.account.avatarUrl} alt="" />
                 )}
                 {login}
               </span>
            )}
          </h2>
          <div className="simulator-history">
            <span>History: {new Date(since).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} - {new Date(until).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
            <button className={`simulator-completeness simulator-completeness--${loadState}`} onClick={() => setShowCoverage(value => !value)}>
              {details.stale ? "Cached history" : loadState === "ready_partial" ? "Partial history" : loadState === "loading_initial" ? "Loading history" : loadState === "error" ? "Load failed" : "Complete"}
            </button>
          </div>
          {showCoverage && <div className="simulator-coverage-details"><strong>Available range</strong> {new Date(details.cacheRange?.since ?? since).toLocaleString()} – {new Date(details.cacheRange?.until ?? until).toLocaleString()} · {events.length} events. {details.stale ? 'This is the last valid cached snapshot; the latest refresh failed.' : loadState === 'ready_partial' ? 'Some GitHub timeline, check, release, or deployment sources may be missing; inferred transitions and metrics are affected.' : 'All loaded sources completed for this bounded range.'}{details.sourceFailures.length > 0 && <ul>{details.sourceFailures.map(failure => <li key={`${failure.sourceId}-${failure.occurredAt}`}><strong>{failure.label}:</strong> {failure.message}</li>)}</ul>}{details.cacheError && <p><strong>Cache:</strong> {details.cacheError.message}</p>}</div>}
        </div>
        
        {mode === "repository" && (
          <RepositorySelector 
            selectedRepo={selectedRepo || undefined} 
            compact
            onSelect={(r) => { setSelectedRepo(r); playback.setCursorManual(since); setSelectedEntityId(undefined); setSelectedEventId(undefined); }} 
          />
        )}
      </header>

      {renderCanvas()}
    </div>
  );
}
