import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Filter, Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";
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

  const repoOwner = selectedRepo ? selectedRepo.nameWithOwner.split("/")[0] : "";
  const repoName = selectedRepo ? selectedRepo.nameWithOwner.split("/")[1] : "";

  const accountSim = useAccountSimulator(login);
  const repoSim = useRepositorySimulator(repoOwner, repoName);

  const activeTabId = useTabsStore(s => s.activeTabId);
  const setTabState = useFlowStore(s => s.setTabState);

  const activeSim = mode === "account" ? accountSim : repoSim;
  const { events, loadState, since, until, setSince, setUntil, refresh } = activeSim;

  const playback = useSimulatorPlayback(events, since, until);
  const stateArray = useMemo(() => Array.from(playback.currentState.values()).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.id.localeCompare(b.id)), [playback.currentState]);
  const expansionContext = `${mode}:${selectedRepo?.id ?? 'account'}:${since}:${until}`;
  const expandedStages = expansion.context === expansionContext ? expansion.stages : new Set<string>();

  useEffect(() => {
    if (selectedEventId) {
       const ev = events.find(e => e.id === selectedEventId);
       if (ev) {
         setTabState(activeTabId, { selectedSimulatorEvent: ev, selectedSimulatorEntity: undefined });
       } else {
         setTabState(activeTabId, { selectedSimulatorEvent: undefined, selectedSimulatorEntity: undefined });
       }
    } else if (selectedEntityId) {
       const ent = stateArray.find(e => e.id === selectedEntityId);
       if (ent) {
         setTabState(activeTabId, { selectedSimulatorEntity: ent, selectedSimulatorEvent: undefined });
       } else {
         setTabState(activeTabId, { selectedSimulatorEntity: undefined, selectedSimulatorEvent: undefined });
       }
    } else {
       setTabState(activeTabId, { selectedSimulatorEntity: undefined, selectedSimulatorEvent: undefined });
    }
  }, [selectedEntityId, selectedEventId, stateArray, events, activeTabId, setTabState]);

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
      return <div style={{ flex: 1, padding: 32, color: "var(--text-error)" }}>Network failure loading simulator data.</div>;
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
             <button className="simulator-control" onClick={() => playback.setCursorManual(until)}>Live <SkipForward size={13} /></button>
             
             <select 
               value={playback.speedMultiplier} 
               onChange={(e) => playback.setSpeedMultiplier(Number(e.target.value))}
               className="simulator-speed"
             >
               <option value={0.25}>0.25x</option>
               <option value={1}>1x</option>
               <option value={4}>4x</option>
               <option value={8}>8x</option>
             </select>
             
             <span className="simulator-control-divider" />
             <div className="simulator-range" aria-label="History range">
               {[1, 7, 30, 90].map(days => <button key={days} className={days === 30 ? "is-active" : ""} onClick={() => setRange(setSince, setUntil, days)}>{days === 1 ? "24h" : `${days}d`}</button>)}
             </div>
             <button className="simulator-control simulator-refresh" onClick={refresh}><RotateCcw size={13} /> Refresh</button>
             <button className="simulator-control"><Filter size={13} /> Filters <span className="simulator-filter-count">{stateArray.filter(entity => entity.stage !== "closed").length}</span></button>
          </div>
          
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
              stages.add(stage);
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
             events={events} 
             cursor={playback.cursor} 
             selectedEventId={selectedEventId}
             onSelectEvent={(id) => { setSelectedEventId(id); setSelectedEntityId(undefined); }}
          />
          <SimulatorMetrics entities={stateArray} events={events.filter(event => event.occurredAt <= playback.cursor)} />
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
            <span className={`simulator-completeness simulator-completeness--${loadState}`}>
              {loadState === "ready_partial" ? "Partial history" : loadState === "loading_initial" ? "Loading history" : loadState === "error" ? "Load failed" : "Complete"}
            </span>
          </div>
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
