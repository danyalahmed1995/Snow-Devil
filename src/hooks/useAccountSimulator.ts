import { useState, useEffect } from "react";
import { SimulatorEvent, SimulatorLoadDetails, SimulatorLoadState } from "../simulator/simulator-types";

import { useModeStore } from "../stores/mode-store";
import { DemoDataProvider } from "../data/demo-provider";
import { emptySimulatorLoadDetails, loadAccountSimulatorSnapshot } from "../simulator/account-simulator-loader";

export function useAccountSimulator(login: string) {
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
    setLoadState(events.length > 0 ? "refreshing" : "loading_initial");
    try {
      if (mode === 'demo') {
        const demoEvents = await DemoDataProvider.accountEvents();
        setEvents(demoEvents);
        setSince(demoEvents[0].occurredAt);
        setUntil(demoEvents[demoEvents.length - 1].occurredAt);
        setLoadState('ready_complete');
        setDetails({ ...emptySimulatorLoadDetails(), loadedSources: 1, totalSources: 1, cacheRange: demoEvents.length ? { since: demoEvents[0].occurredAt, until: demoEvents[demoEvents.length - 1].occurredAt, eventCount: demoEvents.length } : undefined });
        return;
      }
      const snapshot = await loadAccountSimulatorSnapshot(login, since, until);
      setEvents(snapshot.events);
      setDetails(snapshot.details);
      setLoadState(snapshot.loadState);
    } catch {
      const fallback = emptySimulatorLoadDetails();
      setDetails(fallback);
      setLoadState("error");
    }
  };

  useEffect(() => {
    if (login) {
      fetchActivity();
    }
  }, [login, since, until, mode, demoRevision]);

  return { events, loadState, details, since, until, setSince, setUntil, refresh: fetchActivity };
}
