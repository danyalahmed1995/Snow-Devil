import { useState, useEffect, useCallback, useRef } from "react";
import { SimulatorEvent, SimulatorLoadDetails, SimulatorLoadState } from "../simulator/simulator-types";
import { fetchRepositoryActivity } from "../simulator/simulator-github-api";
import { getSimulatorEventsFromDb, saveSimulatorEventsToDb } from "../simulator/simulator-cache";
import { useModeStore } from "../stores/mode-store";
import { DemoDataProvider } from "../data/demo-provider";
import { emptySimulatorLoadDetails, accountCacheRange } from "../simulator/account-simulator-loader";
import { addCalendarDays, startOfCalendarDate, todayCalendarDate } from '../lib/history-date';

export function useRepositorySimulator(owner: string, name: string, timeZone = 'Asia/Karachi') {
  const mode = useModeStore(state => state.mode);
  const demoRevision = useModeStore(state => state.demoRevision);
  const [events, setEvents] = useState<SimulatorEvent[]>([]);
  const [loadState, setLoadState] = useState<SimulatorLoadState>("idle");
  const [details, setDetails] = useState<SimulatorLoadDetails>(() => emptySimulatorLoadDetails());
  const [since, setSince] = useState(() => {
    return startOfCalendarDate(addCalendarDays(todayCalendarDate(timeZone), -30), timeZone);
  });
  const [until, setUntil] = useState(() => new Date().toISOString());
  const eventsRef = useRef(events);
  useEffect(() => { eventsRef.current = events; }, [events]);

  const fetchActivity = useCallback(async () => {
    setLoadState(eventsRef.current.length > 0 ? 'refreshing' : "loading_initial");
    try {
      const repoId = `${owner}/${name}`;
      if (mode === 'demo') {
        const demoEvents = await DemoDataProvider.repositoryEvents(repoId);
        setEvents(demoEvents);
        setSince(demoEvents[0].occurredAt);
        setUntil(demoEvents[demoEvents.length - 1].occurredAt);
        setLoadState('ready_complete');
        setDetails({ ...emptySimulatorLoadDetails(), loadedSources: 1, totalSources: 1, cacheRange: accountCacheRange(demoEvents), historicalDepth: 'retention_bounded', historicalDepthMessage: 'Deterministic Demo Mode fixture range' });
        return;
      }
      
      // Load from cache first
      const cached = await getSimulatorEventsFromDb(repoId);
      if (cached.length > 0) {
        setEvents(cached);
        // We might set 'ready_complete' or 'refreshing' here
        setLoadState("refreshing");
        setDetails({ ...emptySimulatorLoadDetails(), cached: true, stale: true, loadedSources: 0, totalSources: 1, cacheRange: accountCacheRange(cached), historicalDepth: 'partial_events', historicalDepthMessage: 'Cached repository history shown while refreshing' });
      }

      // Fetch from network
      const networkEvents = await fetchRepositoryActivity(owner, name, since, until);
      
      // Merge and save
      await saveSimulatorEventsToDb(networkEvents);
      const allCached = await getSimulatorEventsFromDb(repoId);
      
      setEvents(allCached);
      setLoadState("ready_partial"); // we mark as partial because we didn't fetch full history
      setDetails({ ...emptySimulatorLoadDetails(), loadedSources: 1, totalSources: 1, cacheRange: accountCacheRange(allCached), sourceStatuses: [{ sourceId: 'repository-history', label: 'Repository lifecycle history', purpose: 'Issues, pull requests, reviews, checks, releases, and deployments targeting the selected repository.', affectedData: 'Repository progress, active/completed sections, and activity history', status: 'loaded', retryable: false, lastAttemptAt: new Date().toISOString() }], historicalDepth: 'api_bounded', historicalDepthMessage: 'All configured sources loaded · GitHub API and selected retention window bounded' });
    } catch {
      if (eventsRef.current.length > 0) {
        setLoadState('ready_partial');
        setDetails(current => ({ ...current, cached: true, stale: true, historicalDepth: 'partial_events', historicalDepthMessage: 'Previous repository snapshot shown because refresh failed' }));
      } else setLoadState("error");
    }
  }, [mode, name, owner, since, until]);

  useEffect(() => {
    if (owner && name) {
      fetchActivity();
    }
  }, [demoRevision, fetchActivity, name, owner]);

  return { events, loadState, details, since, until, setSince, setUntil, refresh: fetchActivity };
}
