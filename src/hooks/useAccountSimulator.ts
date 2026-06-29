import { useState, useEffect, useCallback, useRef } from "react";
import { SimulatorEvent, SimulatorLoadDetails, SimulatorLoadState } from "../simulator/simulator-types";

import { useModeStore } from "../stores/mode-store";
import { DemoDataProvider } from "../data/demo-provider";
import { emptySimulatorLoadDetails, loadAccountSimulatorSnapshot } from "../simulator/account-simulator-loader";
import { addCalendarDays, startOfCalendarDate, todayCalendarDate } from '../lib/history-date';

export function useAccountSimulator(login: string, timeZone = 'Asia/Karachi') {
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
    setLoadState(eventsRef.current.length > 0 ? "refreshing" : "loading_initial");
    try {
      if (mode === 'demo') {
        const demoEvents = await DemoDataProvider.accountEvents();
        setEvents(demoEvents);
        setSince(demoEvents[0].occurredAt);
        setUntil(demoEvents[demoEvents.length - 1].occurredAt);
        setLoadState('ready_complete');
        setDetails({ ...emptySimulatorLoadDetails(), loadedSources: 1, totalSources: 1, cacheRange: demoEvents.length ? { since: demoEvents[0].occurredAt, until: demoEvents[demoEvents.length - 1].occurredAt, eventCount: demoEvents.length } : undefined, historicalDepth: 'retention_bounded', historicalDepthMessage: 'Deterministic Demo Mode fixture range' });
        return;
      }
      const snapshot = await loadAccountSimulatorSnapshot(login, since, until);
      setEvents(snapshot.events);
      setDetails(snapshot.details);
      setLoadState(snapshot.loadState);
    } catch {
      if (eventsRef.current.length > 0) {
        setDetails(current => ({ ...current, stale: true, historicalDepth: 'partial_events', historicalDepthMessage: 'Previous snapshot shown because refresh failed' }));
        setLoadState('ready_partial');
      } else {
        setDetails(emptySimulatorLoadDetails());
        setLoadState("error");
      }
    }
  }, [login, mode, since, until]);

  useEffect(() => {
    if (login) {
      fetchActivity();
    }
  }, [demoRevision, fetchActivity, login]);

  return { events, loadState, details, since, until, setSince, setUntil, refresh: fetchActivity };
}
