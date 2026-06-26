import { useState, useEffect } from "react";
import { SimulatorEvent, SimulatorLoadDetails, SimulatorLoadState } from "../simulator/simulator-types";
import { fetchRepositoryActivity } from "../simulator/simulator-github-api";
import { getSimulatorEventsFromDb, saveSimulatorEventsToDb } from "../simulator/simulator-cache";
import { useModeStore } from "../stores/mode-store";
import { DemoDataProvider } from "../data/demo-provider";
import { emptySimulatorLoadDetails, accountCacheRange } from "../simulator/account-simulator-loader";

export function useRepositorySimulator(owner: string, name: string) {
  const mode = useModeStore(state => state.mode);
  const demoRevision = useModeStore(state => state.demoRevision);
  const [events, setEvents] = useState<SimulatorEvent[]>([]);
  const [loadState, setLoadState] = useState<SimulatorLoadState>("idle");
  const [details, setDetails] = useState<SimulatorLoadDetails>(() => emptySimulatorLoadDetails());
  const [since, setSince] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString();
  });
  const [until, setUntil] = useState(() => new Date().toISOString());

  const fetchActivity = async () => {
    setLoadState("loading_initial");
    try {
      const repoId = `${owner}/${name}`;
      if (mode === 'demo') {
        const demoEvents = await DemoDataProvider.repositoryEvents(repoId);
        setEvents(demoEvents);
        setSince(demoEvents[0].occurredAt);
        setUntil(demoEvents[demoEvents.length - 1].occurredAt);
        setLoadState('ready_complete');
        setDetails({ ...emptySimulatorLoadDetails(), loadedSources: 1, totalSources: 1, cacheRange: accountCacheRange(demoEvents) });
        return;
      }
      
      // Load from cache first
      const cached = await getSimulatorEventsFromDb(repoId);
      if (cached.length > 0) {
        setEvents(cached);
        // We might set 'ready_complete' or 'refreshing' here
        setLoadState("refreshing");
        setDetails({ ...emptySimulatorLoadDetails(), cached: true, stale: true, loadedSources: 0, totalSources: 1, cacheRange: accountCacheRange(cached) });
      }

      // Fetch from network
      const networkEvents = await fetchRepositoryActivity(owner, name, since, until);
      
      // Merge and save
      await saveSimulatorEventsToDb(networkEvents);
      const allCached = await getSimulatorEventsFromDb(repoId);
      
      setEvents(allCached);
      setLoadState("ready_partial"); // we mark as partial because we didn't fetch full history
      setDetails({ ...emptySimulatorLoadDetails(), loadedSources: 1, totalSources: 1, cacheRange: accountCacheRange(allCached) });
    } catch {
      setLoadState("error");
    }
  };

  useEffect(() => {
    if (owner && name) {
      fetchActivity();
    }
  }, [owner, name, since, until, mode, demoRevision]);

  return { events, loadState, details, since, until, setSince, setUntil, refresh: fetchActivity };
}
